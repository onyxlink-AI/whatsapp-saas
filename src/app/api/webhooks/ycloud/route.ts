import { type NextRequest, NextResponse, after } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  verifyYCloudSignature,
  parseInbound,
} from "@/features/inbox/services/ycloud-webhook-handler";
import { processInbound } from "@/features/inbox/services/normalizer";
import { checkRateLimits } from "@/features/inbox/services/cost-tracker";
import {
  upsertBatch,
  processNextBatch,
} from "@/features/inbox/services/buffer";
import {
  downloadAndStoreMedia,
  patchMessageMedia,
} from "@/features/inbox/services/media-handler";
import {
  transcribeAudio,
  describeImage,
} from "@/features/inbox/services/media-understanding";
import { syncContactToAirtable } from "@/features/inbox/services/airtable-client";
import { decryptCredentials } from "@/shared/lib/crypto";
import {
  getChatbotRuntimeConfig,
  type ChatbotServicePorts,
  type ChatbotStore,
} from "@/features/chatbot/server/chatbot-service";
import { handleChatbotWhatsAppInbound } from "@/features/chatbot/server/whatsapp-channel";
import { resolveChannelReadiness } from "@/features/chatbot/server/channel-readiness";
import type { ChatbotHead } from "@/features/chatbot/server/chatbot-service";
import { isWhatsAppAgentRuntimeEnabled } from "@/features/agents/services/whatsapp-runtime";

// Keep the function alive long enough for the best-effort fast path below
// (sleep through the buffer window + AI generation). The cron is the fallback.
export const maxDuration = 60;

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// 💬 Chatbot ports for this webhook's read-only needs (see the additive
// branch inside POST below). Never writes — saveHead/appendRevision are
// only reachable from the Chatbot's own configurator route.
function chatbotPorts(): ChatbotServicePorts {
  const client = svc();
  const store: ChatbotStore = {
    async loadHead(workspaceId) {
      const { data, error } = await client
        .from("chatbots")
        .select("revision, status, enabled, document, updated_at, updated_by_email")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        revision: data.revision,
        status: data.status,
        enabled: data.enabled,
        document: data.document as ChatbotHead["document"],
        updatedAt: data.updated_at,
        updatedBy: data.updated_by_email,
      };
    },
    async saveHead() {
      throw new Error("not supported from the ycloud webhook path");
    },
    async appendRevision() {
      throw new Error("not supported from the ycloud webhook path");
    },
  };

  return { store, resolveChannelReadiness };
}

// WH-02: monotonic status order — never go backwards
const STATUS_ORDER = ["queued", "sent", "delivered", "read"] as const;
type OrderedStatus = (typeof STATUS_ORDER)[number];
type MessageStatus = OrderedStatus | "failed";
type StatusMessage = {
  id: string;
  status: MessageStatus | null;
  wamid: string | null;
  meta: Record<string, unknown> | null;
};

export async function handleStatusUpdate(
  supabase: ReturnType<typeof svc>,
  statusData: {
    id?: string;
    wamid?: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const { id: ycloudId, wamid, status: newStatus, errorCode, errorMessage } =
    statusData;
  let msg: StatusMessage | null = null;

  if (wamid) {
    const { data } = await supabase
      .from("messages")
      .select("id, status, wamid, meta")
      .eq("wamid", wamid)
      .maybeSingle();
    msg = data as StatusMessage | null;
  }

  // Enqueued messages often receive their WhatsApp `wamid` asynchronously.
  // dispatch.ts stores the synchronous YCloud id in meta.ycloud_id, so the
  // first status callback must be able to correlate by either identifier.
  if (!msg && ycloudId) {
    const { data } = await supabase
      .from("messages")
      .select("id, status, wamid, meta")
      .eq("meta->>ycloud_id", ycloudId)
      .maybeSingle();
    msg = data as StatusMessage | null;
  }

  // Message not found — can happen for outbound we didn't track
  if (!msg) return;

  const current = msg.status;
  const patch: Record<string, unknown> = {};

  if (wamid && !msg.wamid) {
    patch.wamid = wamid;
  }

  // 'failed' is terminal — always apply regardless of current state
  if (newStatus === "failed") {
    patch.status = "failed";
    patch.meta = {
      ...(msg.meta ?? {}),
      ycloud_error_code: errorCode || undefined,
      ycloud_error_message: errorMessage || undefined,
    };
  }

  // For ordered statuses: only advance, never go back
  const currentIdx = current
    ? STATUS_ORDER.indexOf(current as OrderedStatus)
    : -1;
  const newIdx = STATUS_ORDER.indexOf(newStatus as OrderedStatus);

  if (newIdx > currentIdx) {
    patch.status = newStatus;
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from("messages").update(patch).eq("id", msg.id);
  }
  // else: same or lower status — ignore (monotonic guarantee)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const sigHeader = request.headers.get("YCloud-Signature");

    // E3: per-tenant webhook routing via ?wsid query param
    const wsidParam = request.nextUrl.searchParams.get("wsid");

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // WH-02: classify the event. Status updates carry NO `to` phone — they can
    // only be routed via the ?wsid query param. Signature verification MUST
    // happen before we act on EITHER a status update or an inbound message.
    const isStatusUpdate =
      typeof body === "object" &&
      body !== null &&
      "type" in body &&
      (body as { type: string }).type === "whatsapp.message.updated";

    // Extract destination phone to identify the workspace integration (inbound).
    const toPhone =
      typeof body === "object" &&
      body !== null &&
      "whatsappInboundMessage" in body
        ? ((body as { whatsappInboundMessage?: { to?: string } })
            .whatsappInboundMessage?.to ?? null)
        : null;

    // Events that carry NO actionable data AND cannot identify a workspace
    // (no wsid, no inbound `to`, not a status update) → harmless early 200.
    if (!isStatusUpdate && !toPhone && !wsidParam) {
      return NextResponse.json({ received: true });
    }

    const supabase = svc();

    type IntegrationRow = {
      workspace_id: string;
      credentials: Record<string, unknown>;
      config: Record<string, unknown>;
    };

    let ws: IntegrationRow | null = null;

    if (wsidParam) {
      // E3: direct lookup by workspace_id — faster, no phone scan needed.
      // Status updates always take this path (they have no inbound `to`).
      const { data } = await supabase
        .from("integrations")
        .select("workspace_id, credentials, config")
        .eq("workspace_id", wsidParam)
        .eq("provider", "ycloud")
        .eq("enabled", true)
        .single();
      ws = data ?? null;
    } else {
      // Fallback: phone-based lookup across all enabled integrations (inbound)
      const { data: integrations } = await supabase
        .from("integrations")
        .select("workspace_id, credentials, config")
        .eq("provider", "ycloud")
        .eq("enabled", true)
        .limit(10);

      ws =
        (integrations ?? []).find(
          (i: IntegrationRow) =>
            (i.config as { phone_number?: string }).phone_number === toPhone,
        ) ?? null;
    }

    // No resolvable workspace → 401. A status update without a resolvable
    // (and below, verified) workspace must NEVER fall through to 200.
    if (!ws) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creds = await decryptCredentials(ws.credentials);

    const webhookSecret = creds.webhook_signing_secret;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: verify the signature BEFORE acting on ANY event (status or inbound).
    if (!verifyYCloudSignature(rawBody, sigHeader, webhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // WH-02: monotonic status updates — only reached after signature verification.
    if (isStatusUpdate) {
      const statusData = (
        body as {
          whatsappMessage?: {
            id?: string;
            wamid?: string;
            status?: string;
            errorCode?: string;
            errorMessage?: string;
          };
        }
      ).whatsappMessage;
      if (statusData?.status && (statusData.wamid || statusData.id)) {
        await handleStatusUpdate(supabase, {
          ...statusData,
          status: statusData.status,
        });
      }
      return NextResponse.json({ received: true });
    }

    const normalized = parseInbound(body);
    if (!normalized) {
      return NextResponse.json({ received: true });
    }

    const workspaceId = ws.workspace_id as string;

    // 💬 Chatbot additive branch — only takes effect when this workspace's
    // number is Chatbot-owned right now (published+enabled+bound to
    // 'whatsapp', AND no active Agente WhatsApp — see
    // getChatbotRuntimeConfig/resolveChannelReadiness). Placed BEFORE
    // processInbound so a Chatbot-handled message never creates a
    // contacts/conversations/messages row — "no memoria" by construction,
    // not just policy. When null (the common case), execution falls
    // through unchanged to the existing pipeline below.
    const chatbotRuntime = await getChatbotRuntimeConfig(workspaceId, 'whatsapp', chatbotPorts());
    if (chatbotRuntime) {
      await handleChatbotWhatsAppInbound({
        workspaceId,
        config: chatbotRuntime,
        apiKey: creds.ycloud_api_key ?? '',
        from: normalized.from,
        to: normalized.workspacePhone,
        text: normalized.type === 'text' ? normalized.text : null,
      });
      return NextResponse.json({ received: true, chatbot: true });
    }

    const { contact, conversation, message } = await processInbound(
      workspaceId,
      normalized,
    );

    // Duplicate wamid — already processed
    if (!message) {
      return NextResponse.json({ received: true, dedup: true });
    }

    // Best-effort mirror to the workspace's Airtable base (if connected).
    // Fired independently of the AI/rate-limit branches below — every real
    // inbound message should refresh the contact's row, even when the AI
    // doesn't reply. syncContactToAirtable never throws (self-contained
    // try/catch), so no extra guarding is needed here.
    after(() =>
      syncContactToAirtable(workspaceId, contact, conversation, normalized.text),
    );

    // Media handling (download + AI understanding) runs AFTER the response so
    // the webhook stays fast. transcript/description land in meta before the
    // batch is processed, so the agent reads voice notes/images as text.
    const mediaLink = normalized.type !== "text" ? normalized.mediaLink : null;
    const messageId = message.id;
    const conversationId = conversation.id;
    const mediaJob = mediaLink
      ? async () => {
          try {
            const mediaMeta = await downloadAndStoreMedia({
              link: mediaLink,
              apiKey: creds.ycloud_api_key ?? "",
              workspaceId,
              conversationId,
              mimeType: normalized.mediaMime ?? undefined,
              filename: normalized.mediaFilename ?? undefined,
              caption:
                normalized.text && normalized.text !== "[Multimedia]"
                  ? normalized.text
                  : undefined,
              ycloudMediaId: normalized.mediaId ?? undefined,
            });
            if (!mediaMeta) return;

            // Translate voice/image to text so the agent understands them.
            if (normalized.type === "audio" || normalized.type === "voice") {
              const transcript = await transcribeAudio({
                storagePath: mediaMeta.storage_path,
                mimeType: mediaMeta.mime_type,
                workspaceId,
              });
              if (transcript) mediaMeta.transcript = transcript;
            } else if (normalized.type === "image") {
              const description = await describeImage({
                storagePath: mediaMeta.storage_path,
                mimeType: mediaMeta.mime_type,
                caption: mediaMeta.caption,
                workspaceId,
              });
              if (description) mediaMeta.description = description;
            }

            await patchMessageMedia(workspaceId, messageId, mediaMeta);
          } catch (mediaErr) {
            console.error(
              "[webhook] media handling failed:",
              mediaErr instanceof Error ? mediaErr.message : "unknown",
            );
          }
        }
      : null;

    // AI is toggled off — still fetch the media so the human agent sees it.
    if (!conversation.ai_enabled) {
      if (mediaJob) after(mediaJob);
      return NextResponse.json({ received: true, ai: false });
    }

    // A profile can be fully configured and selected in the SaaS panel while
    // remaining stopped. Only the explicit switch in Oficina Virtual starts
    // the AI runtime; inbound messages are still stored for human attention.
    if (!(await isWhatsAppAgentRuntimeEnabled(workspaceId))) {
      if (mediaJob) after(mediaJob);
      return NextResponse.json({ received: true, ai: false, officeWhatsAppInactive: true });
    }

    // Rate-limit check — still runs here to avoid buffering rate-limited contacts
    const { allowed, reason } = await checkRateLimits(workspaceId, contact.id);
    if (!allowed) {
      // SEC-09: log only non-sensitive fields (no credentials or contact PII)
      console.warn("[webhook] rate limited:", reason ?? "unknown reason");
      if (mediaJob) after(mediaJob);
      return NextResponse.json({ received: true, rateLimited: true });
    }

    // Buffer the message — AI reply is deferred to the cron job.
    // The silence window is configurable per workspace (YCloud settings).
    const bufferSeconds = Number(
      (ws.config as { buffer_silence_seconds?: number }).buffer_silence_seconds,
    );
    const silenceMs =
      Number.isFinite(bufferSeconds) && bufferSeconds >= 3
        ? Math.min(bufferSeconds, 120) * 1000
        : undefined;

    await upsertBatch({
      workspaceId,
      conversationId: conversation.id,
      messageId: message.id,
      silenceMs,
    });

    // Best-effort fast path: process the batch the moment its buffer window
    // closes, instead of waiting up to ~60s for the next cron tick. Runs after
    // the response is sent. If the function is recycled before it fires, the
    // every-minute cron still picks the batch up — so this only ever speeds
    // things up, never breaks them. A later message extends flush_at, so an
    // early fire simply claims nothing and the latest fire does the work.
    const effectiveSilenceMs = silenceMs ?? 30_000;
    after(async () => {
      // Download + understand media first so the transcript/description is in
      // meta before the batch is consolidated for the agent.
      if (mediaJob) await mediaJob();
      await new Promise((resolve) =>
        setTimeout(resolve, effectiveSilenceMs + 500),
      );
      try {
        await processNextBatch();
      } catch (e) {
        console.error(
          "[webhook] fast-path process error:",
          e instanceof Error ? e.message : "unknown",
        );
      }
    });

    return NextResponse.json({ received: true, buffered: true });
  } catch (err) {
    // SEC-09: never log full error objects — they may contain credentials or raw payloads
    console.error(
      "[webhook] unhandled error:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

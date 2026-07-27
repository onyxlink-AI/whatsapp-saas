import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InboxLayout } from "@/features/inbox/components/inbox-layout";
import { ChatThread } from "@/features/inbox/components/chat-thread";
import type {
  ConversationWithContact,
  ConversationRow,
  ContactRow,
  MessageRow,
} from "@/features/inbox/types";
import type { WorkspaceRole } from "@/features/inbox/hooks/use-role";
import type { ContactMemory } from "@/features/inbox/services/contact-memory";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InboxDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Authenticate
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 2. Fetch the conversation + contact first — RLS already scopes this to
  // workspaces the user is an active member of, so a successful fetch here
  // proves membership. It also gives us the conversation's REAL
  // workspace_id, which the membership lookup below must be scoped to.
  const { data: convData } = await supabase
    .from("conversations")
    .select("*, contact:contacts(*)")
    .eq("id", id)
    .single();

  if (!convData) notFound();

  const convWithContact = convData as ConversationRow & { contact: ContactRow };

  // 3. Get the membership for THIS conversation's workspace specifically —
  // a user active in several workspaces (e.g. an agency superadmin) must
  // never have their role or sidebar computed from an unrelated membership
  // row. Un-scoped `.limit(1)` here previously picked an arbitrary
  // membership, which could show the wrong workspace's conversation list
  // and the wrong role-gated UI for this exact page.
  const { data: membership } = await supabase
    .from("memberships")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .eq("workspace_id", convWithContact.workspace_id)
    .eq("is_active", true)
    .maybeSingle();

  const role = (membership?.role ?? "agent") as WorkspaceRole;

  // 3b. Memoria Inteligente Avanzada (opt-in): only fetch the contact's
  // memory when the workspace has it enabled — RLS-scoped read, same client
  // as everything else on this page (no service-role here).
  const { data: wsData } = await supabase
    .from("workspaces")
    .select("advanced_memory_enabled, whatsapp_agent_enabled")
    .eq("id", convWithContact.workspace_id)
    .maybeSingle();
  const advancedMemoryEnabled = wsData?.advanced_memory_enabled === true;

  if (wsData?.whatsapp_agent_enabled === false) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Esta empresa no incluye Agentes de WhatsApp — tu plan es Onyxlink
          Gestión.
        </p>
      </div>
    );
  }

  let initialMemory: ContactMemory | null = null;
  if (advancedMemoryEnabled) {
    const { data: memData } = await supabase
      .from("contact_memories")
      .select("*")
      .eq("contact_id", convWithContact.contact.id)
      .maybeSingle();
    initialMemory = (memData as ContactMemory | null) ?? null;
  }

  // 4. Fetch messages (ASC, limit 100)
  const { data: messagesData } = await supabase
    .from("messages")
    .select("*, sender:users!sender_user_id(full_name, avatar_url)")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(100);

  const messages = (messagesData ?? []) as MessageRow[];

  // 5. Fetch sidebar conversations (same workspace, for InboxLayout)
  let sidebarConversations: ConversationWithContact[] = [];

  if (membership) {
    const { data: conversations } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("workspace_id", membership.workspace_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);

    const rows = (conversations ?? []) as (ConversationRow & {
      contact: ContactRow;
    })[];

    const convIds = rows.map((c) => c.id);
    const lastMessageMap = new Map<
      string,
      Pick<MessageRow, "body" | "direction" | "created_at">
    >();

    if (convIds.length > 0) {
      const { data: recentMessages } = await supabase
        .from("messages")
        .select("conversation_id, body, direction, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      if (recentMessages) {
        for (const msg of recentMessages) {
          if (!lastMessageMap.has(msg.conversation_id)) {
            lastMessageMap.set(msg.conversation_id, {
              body: msg.body,
              direction: msg.direction,
              created_at: msg.created_at,
            });
          }
        }
      }
    }

    sidebarConversations = rows.map((conv) => ({
      ...conv,
      last_message: lastMessageMap.get(conv.id) ?? null,
    }));
  }

  const conversation: ConversationWithContact = {
    ...convWithContact,
    last_message:
      messages.length > 0
        ? {
            body: messages[messages.length - 1].body,
            direction: messages[messages.length - 1].direction,
            created_at: messages[messages.length - 1].created_at,
          }
        : null,
  };

  return (
    <InboxLayout
      conversations={sidebarConversations}
      workspaceId={membership?.workspace_id ?? null}
    >
      <ChatThread
        conversation={conversation}
        initialMessages={messages}
        currentUserId={user.id}
        role={role}
        advancedMemoryEnabled={advancedMemoryEnabled}
        initialMemory={initialMemory}
      />
    </InboxLayout>
  );
}

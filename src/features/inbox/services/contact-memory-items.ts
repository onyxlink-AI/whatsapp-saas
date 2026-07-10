import { createClient as createSbClient } from "@supabase/supabase-js";
import { embed, embedMany } from "ai";
import { getOpenRouterApiKey } from "./openrouter";
import { getEmbeddingModel, isEmbeddingDisabled } from "./kb-service";

// contact-memory-items.ts — Memoria Inteligente Avanzada (Fase 3): atomic,
// embeddable "recuerdos" per contact. Same pgvector pattern as kb-service.ts
// (kb_chunks / match_kb_chunks), scoped to one contact instead of a workspace
// document set. Dormant unless the caller gates on advanced_memory_enabled.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface NewMemoryItem {
  content: string;
  category?: string | null;
}

/**
 * Embeds and inserts new atomic memory items for a contact. Silently skips
 * (storing nothing) when no OpenRouter key is configured, same graceful
 * degradation as kb-service.ts's ingestDocument.
 */
export async function insertMemoryItems(opts: {
  workspaceId: string;
  contactId: string;
  conversationId?: string;
  items: NewMemoryItem[];
}): Promise<number> {
  const { workspaceId, contactId, conversationId, items } = opts;
  if (items.length === 0) return 0;

  const apiKey = await getOpenRouterApiKey(workspaceId);
  if (isEmbeddingDisabled(apiKey)) {
    console.warn(
      "[contact-memory-items] no OpenRouter key configured — skipping item storage",
    );
    return 0;
  }

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(apiKey),
    values: items.map((i) => i.content),
  });

  const supabase = svc();
  const rows = items.map((item, idx) => ({
    workspace_id: workspaceId,
    contact_id: contactId,
    content: item.content,
    category: item.category ?? null,
    embedding: embeddings[idx],
    conversation_id: conversationId ?? null,
  }));

  const { error } = await supabase.from("contact_memory_items").insert(rows);
  if (error) {
    console.error("[contact-memory-items] insert failed:", error);
    return 0;
  }

  return rows.length;
}

export interface MemoryItemSearchResult {
  content: string;
  category: string | null;
  similarity: number;
}

/**
 * Semantic search over a single contact's memory items. Embeds the query and
 * runs match_contact_memory_items (cosine similarity, scoped to workspace +
 * contact). Falls back to an empty result set when embeddings are disabled.
 */
export async function searchContactMemories(
  workspaceId: string,
  contactId: string,
  query: string,
  topK = 5,
): Promise<MemoryItemSearchResult[]> {
  const apiKey = await getOpenRouterApiKey(workspaceId);
  if (isEmbeddingDisabled(apiKey)) return [];

  const { embedding: queryEmbedding } = await embed({
    model: getEmbeddingModel(apiKey),
    value: query,
  });

  const supabase = svc();
  const { data, error } = await supabase.rpc("match_contact_memory_items", {
    p_workspace_id: workspaceId,
    p_contact_id: contactId,
    p_query_embedding: queryEmbedding,
    p_match_count: topK,
  });

  if (error) {
    console.error(
      "[contact-memory-items] match_contact_memory_items RPC error:",
      error,
    );
    return [];
  }

  return (data ?? []) as MemoryItemSearchResult[];
}

/**
 * Formats the top matching recuerdos into a prompt block. Distinct from
 * contact-memory.ts's formatMemoryContext (Fase 1's fixed summary block) —
 * this one changes per message, showing only what's relevant right now.
 */
export function formatMemoryItemsContext(
  results: MemoryItemSearchResult[],
): string {
  if (results.length === 0) return "";
  const lines = results.map((r) => `- ${r.content}`);
  return `## Recuerdos relevantes\n${lines.join("\n")}`;
}

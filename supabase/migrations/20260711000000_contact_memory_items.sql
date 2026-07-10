-- ============================================================================
-- Memoria Inteligente Avanzada (Fase 3): recuerdos individuales con embeddings.
-- Complementa contact_memories (Fase 1, un resumen fijo por contacto) con
-- filas atómicas que se pueden buscar semánticamente antes de responder —
-- mismo patrón que kb_documents/kb_chunks + match_kb_chunks para la KB.
-- Dormant unless the workspace has advanced_memory_enabled (same flag as
-- Fase 1/2 — no new flag needed).
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_memory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  category        TEXT,
  embedding       vector(1536),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_memory_items_contact
  ON contact_memory_items(workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_memory_items_embedding_hnsw
  ON contact_memory_items USING hnsw (embedding vector_cosine_ops);

ALTER TABLE contact_memory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read contact_memory_items"
  ON contact_memory_items FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write contact_memory_items"
  ON contact_memory_items FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ============================================
-- RPC: match_contact_memory_items
-- Same shape as match_kb_chunks, scoped additionally by contact_id so a
-- contact only ever surfaces their own recuerdos.
-- ============================================
CREATE OR REPLACE FUNCTION match_contact_memory_items(
  p_workspace_id UUID,
  p_contact_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  category TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    cmi.content,
    cmi.category,
    1 - (cmi.embedding <=> p_query_embedding) AS similarity
  FROM contact_memory_items cmi
  WHERE cmi.workspace_id = p_workspace_id
    AND cmi.contact_id = p_contact_id
    AND cmi.embedding IS NOT NULL
  ORDER BY cmi.embedding <=> p_query_embedding
  LIMIT GREATEST(p_match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION match_contact_memory_items(uuid, uuid, vector, int)
  TO authenticated, service_role;

-- Multiple saved agent profiles per workspace are allowed; the existing
-- partial unique index uq_agents_one_active still guarantees that only one
-- profile can answer at a time. Each new profile gets its own prompt.
ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_workspace_id_type_key;

CREATE INDEX IF NOT EXISTS idx_agents_workspace_type
  ON public.agents(workspace_id, type);

-- Security + atomicity fix for prompt publishing (E2E production-polish audit):
-- publishPromptVersion() previously issued three sequential, unscoped UPDATEs
-- from app code — none of them filtered by workspace_id, so a manager of
-- workspace A who knew (or enumerated) a prompt_version id belonging to
-- workspace B could publish it there (cross-tenant IDOR). It also risked
-- leaving two versions marked 'published' if the process died between
-- statements. Mirrors the existing set_active_agent(p_workspace, p_agent)
-- pattern: one SECURITY DEFINER function, workspace-scoped WHERE clauses,
-- service_role-only execution.
CREATE OR REPLACE FUNCTION publish_prompt_version(p_workspace UUID, p_prompt UUID, p_version UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.prompt_versions
    SET state = 'published', published_at = now()
    WHERE id = p_version AND prompt_id = p_prompt
      AND prompt_id IN (SELECT id FROM public.prompts WHERE id = p_prompt AND workspace_id = p_workspace);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prompt_version % not found in workspace %', p_version, p_workspace;
  END IF;

  UPDATE public.prompts
    SET active_version_id = p_version
    WHERE id = p_prompt AND workspace_id = p_workspace;

  UPDATE public.prompt_versions
    SET state = 'draft'
    WHERE prompt_id = p_prompt AND id <> p_version
      AND prompt_id IN (SELECT id FROM public.prompts WHERE id = p_prompt AND workspace_id = p_workspace);
END;
$$;

REVOKE ALL ON FUNCTION publish_prompt_version(UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION publish_prompt_version(UUID, UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION publish_prompt_version(UUID, UUID, UUID) TO service_role;

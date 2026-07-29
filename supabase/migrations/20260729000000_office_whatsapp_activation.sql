-- The WhatsApp profile is prepared and selected in the SaaS agent panel, but
-- its live operation is started explicitly from Oficina Virtual. Keeping this
-- separate from whatsapp_agent_enabled preserves the product entitlement and
-- prevents a merely configured profile from appearing or answering.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS office_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspaces.office_whatsapp_enabled IS
  'Runtime switch controlled from Oficina Virtual. Requires a selected agent and a configured YCloud integration.';

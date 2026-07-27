-- ============================================================================
-- Local dev fixtures — auto-applied by `supabase db reset` (default seed path).
--
-- Without this file, a reset wipes auth.users/workspaces/memberships/agents
-- with nothing to recreate them, so every local login and every "test the
-- WhatsApp agent" walkthrough breaks the moment someone resets the DB.
--
-- Creates exactly the environment this repo's local test fixtures assume:
--   - superadmin@onyxlink.local  (is_super_admin=true, admin of both workspaces)
--   - cliente@empresaa.local    (admin of Empresa A only)
--   both with password: TestLocal123!
--   - Empresa A (prueba local): whatsapp_agent_enabled, office_virtual_enabled,
--     chatbot_enabled; agents Carlos/Sofía/Andrés (Carlos active); YCloud +
--     OpenRouter + Google Calendar integration rows present but with NO
--     credentials — deliberately "needs attention" until a real developer
--     plugs in their own local key via Settings → Integraciones. Never seed a
--     real/working credential here.
--   - Empresa B (prueba local): whatsapp_agent_enabled=false (Gestión-only
--     plan), used for cross-tenant isolation tests.
--
-- Idempotent: safe to re-run manually (`psql -f supabase/seed.sql`) against a
-- DB that already has this data — every insert is ON CONFLICT DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Auth users (auth.users + auth.identities — Supabase Auth's own tables)
-- ---------------------------------------------------------------------------

-- NOTE: confirmation_token / recovery_token / email_change_token_new /
-- email_change / email_change_token_current / reauthentication_token have no
-- column DEFAULT, so an omitted value is NULL — but GoTrue's Go SQL driver
-- scans them into non-nullable strings and errors with "Database error
-- querying schema" (Scan error ... converting NULL to string) on ANY login
-- for a user missing them. They must be explicit empty strings.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token,
  created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '94ede212-a935-4259-a0e9-5a1547422477',
    'authenticated', 'authenticated', 'superadmin@onyxlink.local',
    crypt('TestLocal123!', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"email_verified": true}'::jsonb,
    '', '', '', '', '', '',
    NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '8a0684ce-05ee-4741-a26c-5131df1924ba',
    'authenticated', 'authenticated', 'cliente@empresaa.local',
    crypt('TestLocal123!', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"email_verified": true}'::jsonb,
    '', '', '', '', '', '',
    NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
) VALUES
  (
    gen_random_uuid(), '94ede212-a935-4259-a0e9-5a1547422477',
    '94ede212-a935-4259-a0e9-5a1547422477',
    '{"sub": "94ede212-a935-4259-a0e9-5a1547422477", "email": "superadmin@onyxlink.local", "email_verified": true}'::jsonb,
    'email', NOW(), NOW()
  ),
  (
    gen_random_uuid(), '8a0684ce-05ee-4741-a26c-5131df1924ba',
    '8a0684ce-05ee-4741-a26c-5131df1924ba',
    '{"sub": "8a0684ce-05ee-4741-a26c-5131df1924ba", "email": "cliente@empresaa.local", "email_verified": true}'::jsonb,
    'email', NOW(), NOW()
  )
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ---------------------------------------------------------------------------
-- public.users profiles
-- ---------------------------------------------------------------------------

INSERT INTO public.users (id, full_name, email, is_active, is_super_admin) VALUES
  ('94ede212-a935-4259-a0e9-5a1547422477', 'Super Admin', 'superadmin@onyxlink.local', TRUE, TRUE),
  ('8a0684ce-05ee-4741-a26c-5131df1924ba', 'Cliente Empresa A', 'cliente@empresaa.local', TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------

INSERT INTO public.workspaces (
  id, name, slug, settings, is_active,
  whatsapp_agent_enabled, office_virtual_enabled, chatbot_enabled, gestion_enabled
) VALUES
  (
    '1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'Empresa A (prueba local)', 'empresa-a-prueba-local',
    '{"timezone": "America/Mexico_City", "language": "es"}'::jsonb, TRUE,
    TRUE, TRUE, TRUE, FALSE
  ),
  (
    '9003dc6d-dafa-48b3-be17-71e36e08272d', 'Empresa B (prueba local)', 'empresa-b-prueba-local',
    '{"timezone": "America/Mexico_City", "language": "es"}'::jsonb, TRUE,
    FALSE, TRUE, TRUE, FALSE
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Memberships — superadmin is admin of BOTH (needed by the RLS privilege
-- tests and by the cross-tenant IDOR tests); cliente is admin of Empresa A only.
-- ---------------------------------------------------------------------------

INSERT INTO public.memberships (workspace_id, user_id, role, is_active) VALUES
  ('1b807ae9-03a2-4cf5-84af-8b72a7078ad9', '94ede212-a935-4259-a0e9-5a1547422477', 'admin', TRUE),
  ('9003dc6d-dafa-48b3-be17-71e36e08272d', '94ede212-a935-4259-a0e9-5a1547422477', 'admin', TRUE),
  ('1b807ae9-03a2-4cf5-84af-8b72a7078ad9', '8a0684ce-05ee-4741-a26c-5131df1924ba', 'admin', TRUE)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Business info (Empresa A)
-- ---------------------------------------------------------------------------

INSERT INTO public.business_info (workspace_id, structured, free_text) VALUES
  ('1b807ae9-03a2-4cf5-84af-8b72a7078ad9', '{"name": "Empresa A (prueba local)"}'::jsonb, '')
ON CONFLICT (workspace_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Integrations (Empresa A) — enabled but WITHOUT credentials on purpose.
-- This is the exact "needs attention" state the test-chat playground must
-- work correctly under: OpenRouter/YCloud/Google Calendar all present but not
-- actually usable until a real developer configures their own key.
-- ---------------------------------------------------------------------------

INSERT INTO public.integrations (workspace_id, provider, enabled, credentials, config) VALUES
  ('1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'ycloud', TRUE, '{}'::jsonb, '{"phone_number": "+10000000001"}'::jsonb),
  ('1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'openrouter', TRUE, '{}'::jsonb, '{"primary_model": "openai/gpt-4o-mini", "fallback_model": "anthropic/claude-3-5-haiku", "daily_limit_usd": 20}'::jsonb),
  ('1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'google_calendar', TRUE, '{}'::jsonb, '{"timezone": "America/Mexico_City", "calendar_id": "primary"}'::jsonb)
ON CONFLICT (workspace_id, provider) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Agents (Empresa A) — mirrors the default backfill in
-- 20260609000003_agents.sql (same names/avatars/starter prompts), since that
-- migration's own backfill only runs once at migration-apply time and never
-- sees workspaces created here in the seed.
-- ---------------------------------------------------------------------------

INSERT INTO public.prompts (id, workspace_id, scope, scope_ref, name) VALUES
  ('f8be9292-4ebb-4850-a0e0-645915ee5c96', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'mode', 'setter', 'Agente setter'),
  ('b5a21a44-a453-4ffa-8b4a-c74d838f2107', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'mode', 'soporte', 'Agente soporte'),
  ('068deea6-7fbc-4998-8a86-031d14b7c0ad', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'mode', 'agendamiento', 'Agente agendamiento')
ON CONFLICT (workspace_id, scope, scope_ref) DO NOTHING;

INSERT INTO public.prompt_versions (id, workspace_id, prompt_id, version, state, body, published_at) VALUES
  (
    'a6ebcc56-e782-436c-b314-48a1f98a9c04', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9',
    'f8be9292-4ebb-4850-a0e0-645915ee5c96', 1, 'published',
    'Eres {{agent_name}}, agente de ventas de {{business_name}}. Tu objetivo es calificar leads y agendar citas. Sé amable, profesional y directo. Responde en mensajes cortos, como en WhatsApp.',
    NOW()
  ),
  (
    '7c977843-27c3-40f9-aefa-24a1ae85674c', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9',
    'b5a21a44-a453-4ffa-8b4a-c74d838f2107', 1, 'published',
    'Eres {{agent_name}}, agente de soporte de {{business_name}}. Responde dudas con precisión y empatía. Si no puedes resolver algo, ofrece escalar con un humano. Responde en mensajes cortos.',
    NOW()
  ),
  (
    'bfd55a28-df9e-4de0-8b8c-d0ed829abf02', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9',
    '068deea6-7fbc-4998-8a86-031d14b7c0ad', 1, 'published',
    'Eres {{agent_name}}, asistente de agendamiento de {{business_name}}. Ayuda a reservar citas, confirma disponibilidad y datos de contacto. Responde en mensajes cortos.',
    NOW()
  )
ON CONFLICT (prompt_id, version) DO NOTHING;

UPDATE public.prompts SET active_version_id = 'a6ebcc56-e782-436c-b314-48a1f98a9c04' WHERE id = 'f8be9292-4ebb-4850-a0e0-645915ee5c96';
UPDATE public.prompts SET active_version_id = '7c977843-27c3-40f9-aefa-24a1ae85674c' WHERE id = 'b5a21a44-a453-4ffa-8b4a-c74d838f2107';
UPDATE public.prompts SET active_version_id = 'bfd55a28-df9e-4de0-8b8c-d0ed829abf02' WHERE id = '068deea6-7fbc-4998-8a86-031d14b7c0ad';

INSERT INTO public.agents (id, workspace_id, type, name, avatar_key, model, is_active, prompt_id) VALUES
  ('06f9c280-9483-4321-a1c9-43fdc4539d20', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'setter', 'Carlos', 'setter', NULL, TRUE, 'f8be9292-4ebb-4850-a0e0-645915ee5c96'),
  ('d239dde4-2f33-438a-b03c-1b01657bdf61', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'soporte', 'Sofía', 'soporte', NULL, FALSE, 'b5a21a44-a453-4ffa-8b4a-c74d838f2107'),
  ('e0998df2-f58f-4271-bdec-f9ba8d8e666f', '1b807ae9-03a2-4cf5-84af-8b72a7078ad9', 'agendamiento', 'Andrés', 'agendamiento', NULL, FALSE, '068deea6-7fbc-4998-8a86-031d14b7c0ad')
ON CONFLICT (workspace_id, type) DO NOTHING;

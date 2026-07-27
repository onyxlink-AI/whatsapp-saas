-- ============================================================================
-- Default schema-level privileges for anon/authenticated/service_role.
--
-- Discovered while validating the Oficina Virtual persistence locally: a
-- fresh `supabase start` leaves every table in `public` (all 36 of them —
-- this predates the office-virtual work, it is not specific to it) without
-- basic USAGE-on-schema for these three roles. On a hosted Supabase project
-- this is set up once by the platform outside the migrations folder, so it
-- was never necessary to state explicitly here — but that means a fresh
-- local/self-hosted install (`supabase start` from a clean volume) has never
-- actually worked past this point: PostgREST authenticates as one of these
-- roles and Postgres rejects the query with "permission denied for schema
-- public" before row-level security is even evaluated, regardless of
-- `service_role`'s BYPASSRLS attribute (GRANT and RLS are independent
-- layers).
--
-- This does not change what anon/authenticated can actually read or write —
-- every table already has real RLS policies (verified for workspaces, users,
-- memberships, agents, prompts, integrations, office_virtual_configurations,
-- etc.) that scope access by workspace membership or super_admin status.
-- service_role additionally has BYPASSRLS, which is the actual, separate
-- mechanism it relies on to bypass RLS — this migration does not touch that.
--
-- Table/sequence privilege ceiling — audited 2026-07-23
-- ------------------------------------------------------
-- Table-level GRANT/REVOKE and the schema's `ALTER DEFAULT PRIVILEGES` are a
-- SEPARATE layer from what THIS migration writes: Supabase's own platform
-- bootstrap (local CLI and hosted alike — confirmed via `pg_default_acl`,
-- role `postgres`, schema `public`) already sets a default ACL that grants
-- every *future* table/sequence created by `postgres` (i.e. every table any
-- migration creates) full `arwdDxtm` (ALL) on tables and `rwU` (SELECT +
-- UPDATE + USAGE) on sequences, to anon/authenticated/service_role alike.
-- That default ACL is Supabase's own documented security model — "RLS is
-- the actual gate, table grants are deliberately wide open" — and it is set
-- BEFORE any migration in this folder runs, so a plain `GRANT SELECT,
-- INSERT, UPDATE, DELETE ...` here is redundant for future tables (GRANT is
-- additive-only; it can raise the ceiling but never lower it) — confirmed
-- empirically: `information_schema.role_table_grants` shows anon and
-- authenticated with TRUNCATE/REFERENCES/TRIGGER on every existing table
-- even though nothing in this repo ever granted those specific privileges.
--
-- TRUNCATE is the one bit in that default that is a genuine, avoidable risk:
-- Postgres does not evaluate row security for TRUNCATE (RLS only gates
-- SELECT/INSERT/UPDATE/DELETE), so any role holding it can wipe an entire
-- table in one statement regardless of policy. REFERENCES/TRIGGER are
-- lower-risk but equally unused. `grep -rin TRUNCATE supabase/migrations/`
-- and a full read of every RPC-reachable function in this schema confirm
-- the app never issues TRUNCATE, nor does PostgREST's REST/RPC surface
-- expose a verb that maps to it — so this is not exploitable through the
-- app today, but the privilege itself should not exist for client-facing
-- roles. This migration explicitly revokes it (safe on a hosted project
-- too: it only removes a privilege the app has never used, never disables
-- RLS, and is idempotent to re-run).
--
-- Deliberately TABLES AND SEQUENCES ONLY — never a blanket function grant.
-- 20260608000008_sec02_function_hardening.sql and 20260609000003_agents.sql
-- each individually REVOKE EXECUTE from anon/authenticated on specific
-- SECURITY DEFINER functions (auth_workspace_ids, auth_has_role,
-- claim_next_batch, cancel_batch, check_outbound_24h_window,
-- set_active_agent) as a deliberate hardening measure; a blanket
-- `GRANT EXECUTE ON ALL FUNCTIONS` here would silently undo every one of
-- those and hand anon/authenticated direct RPC access to functions that
-- are meant to be server-only. Any function that genuinely needs client
-- RPC access already grants it explicitly in its own migration (see
-- match_contact_memory_items in 20260711000000_contact_memory_items.sql).
-- See also 20260723010000_revoke_public_execute_rls_helpers.sql, which
-- closes the equivalent gap for auth_workspace_ids()/auth_has_role().
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- So tables/sequences created by *future* migrations are covered too,
-- without needing to repeat this grant every time. The REVOKE half here
-- matters just as much as the GRANT half: without it, Supabase's own
-- default ACL (see above) re-grants TRUNCATE/REFERENCES/TRIGGER and
-- sequence UPDATE to anon/authenticated on every table any later migration
-- creates, silently re-opening the same gap this migration just closed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM anon, authenticated;

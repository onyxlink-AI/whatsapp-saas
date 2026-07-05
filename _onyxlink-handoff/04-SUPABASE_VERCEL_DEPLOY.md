# 04 - SUPABASE VERCEL DEPLOY

## Supabase

Comprobar:

- Proyecto creado.
- URL copiada.
- anon key copiada.
- service role copiada.
- Migraciones aplicadas.
- RLS activado.
- Tablas creadas.
- Auth funcionando.
- Super admin creado.

## Tablas esperadas

- workspaces
- users
- contacts
- conversations
- messages
- prompts
- tools
- tool_configs
- kb_documents
- templates
- integrations
- logs
- events

La lista exacta puede variar según el repo, pero debe mantener multi-tenant por workspace.

## Vercel

Comprobar:

- Proyecto creado.
- Variables cargadas.
- Build correcto.
- Deploy correcto.
- `NEXT_PUBLIC_APP_URL` apunta a producción.
- Cron del buffer activo.
- Dominio de producción disponible.

## GitHub

Recomendado:

- Repo privado.
- Vercel conectado a GitHub.
- Auto-deploy por push.

## No hacer

- No subir `.env.local`.
- No subir tokens.
- No subir passwords.

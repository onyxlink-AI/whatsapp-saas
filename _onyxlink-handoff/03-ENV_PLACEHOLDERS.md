# 03 - ENV PLACEHOLDERS

## Regla de seguridad

No pegar secretos en el chat.

Claude Code debe crear archivos con placeholders y el usuario rellena localmente.

## Archivo principal

`.env.local`

## Variables habituales

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
NEXT_PUBLIC_APP_URL=
APP_SECRET=
CRON_SECRET=
ENCRYPTION_KEY=
```

## Variables de instalación

Si el instalador necesita tokens temporales, guardarlos en archivo local ignorado por Git.

Ejemplo:

```text
.install.local
```

Variables posibles:

```env
SUPABASE_DB_PASSWORD=
SUPABASE_ACCESS_TOKEN=
VERCEL_TOKEN=
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
```

## Regla

Los tokens de instalación no deben subirse a Vercel si solo sirven para instalar.

## YCloud

Las credenciales YCloud del cliente normalmente se configuran dentro del workspace, no en el `.env` global, salvo que el repo indique otra cosa.

## HighLevel

Las credenciales HighLevel deben quedar por workspace, no globales, salvo que el repo indique otra cosa.

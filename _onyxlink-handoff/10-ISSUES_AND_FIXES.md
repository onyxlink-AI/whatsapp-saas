# 10 - ISSUES AND FIXES

## Objetivo

Registrar problemas reales de instalación y pruebas.

## Formato

### Issue 1

Fecha:

2026-07-04

Descripción:

En Windows, `node scripts/setup.mjs doctor` marcaba como faltantes (❌) todas las
variables de `.env.local` aunque tuvieran valores reales guardados, y también
marcaba `node`/`supabase`/`vercel` como no instalados aunque sí lo estaban.

Causa:

1. `.env.local` editado a mano en un editor de Windows quedó con finales de línea
   `\r\n` (CRLF). La regex `/^([A-Z0-9_]+)=(.*)$/` usada en `parseEnv`/`rewriteEnv`
   nunca hace match en una línea que termina en `\r` (sin flag `m`, `$` solo
   matchea el final absoluto del string, y `.` no matchea `\r`), así que la línea
   entera se descartaba silenciosamente.
2. `hasCli()` usaba `command -v <nombre>`, que no existe en `cmd.exe` (Windows),
   así que siempre fallaba ahí aunque el CLI estuviera instalado.

Fix aplicado:

- `parseEnv` y `rewriteEnv` en `scripts/setup.mjs` ahora separan líneas con
  `split(/\r?\n/)` en vez de `split("\n")`, tolerando CRLF y LF por igual.
- `hasCli()` ahora usa `where <nombre>` en `win32` y `command -v <nombre>` en el
  resto de plataformas.

Resultado:

`node scripts/setup.mjs doctor` ahora reporta correctamente en Windows tanto los
CLIs instalados como las variables de `.env.local` ya rellenadas.

### Issue 2

Fecha:

2026-07-04

Descripción:

El agente no respondía a mensajes de WhatsApp reales. En los logs de producción
de Vercel, `POST /api/webhooks/ycloud` devolvía 401 en cada intento. En YCloud
(Webhooks → Registros) se confirmó que YCloud sí llamaba al endpoint, pero
siempre recibía `{"error": "Unauthorized"}`.

Causa:

El webhook en YCloud estaba configurado con la URL de un workspace que ya no
existía: `?wsid=<id-del-workspace-viejo>`. Ese workspace (uno ficticio de
prueba) se había borrado y se creó uno nuevo ("Onyxlink") con un `workspace_id`
distinto. El código de `src/app/api/webhooks/ycloud/route.ts` busca la
integración por `wsid` exacto; al no encontrar ninguna fila (`ws === null`)
devuelve 401 **antes** de siquiera llegar a verificar la firma — con lo cual el
síntoma se parece a un problema de firma/secret, pero es en realidad un
`wsid` obsoleto.

Fix aplicado:

Se actualizó la URL del webhook en YCloud (Webhooks → editar endpoint) para
usar el `wsid` del workspace actual, tomando la URL exacta que muestra la app
en `Settings → Integraciones → YCloud → Webhook URL` de ese workspace.

Resultado:

Mensaje de prueba entregado correctamente tras el cambio.

**Lección para la próxima vez:** cada vez que se borra y se recrea un
workspace (o se cambia de workspace para un mismo número), hay que volver a
copiar la Webhook URL desde `Settings → Integraciones → YCloud` de ese
workspace y actualizarla en YCloud — el `wsid` cambia con cada workspace nuevo,
la URL vieja queda huérfana y YCloud seguirá reintentando contra un endpoint
que ya no resuelve a ningún workspace.

## Tipos de errores esperados

- Variables faltantes.
- Deploy en cuenta Vercel equivocada.
- Webhook con localhost.
- Webhook URL antigua tras dominio propio.
- YCloud no recibe.
- OpenRouter sin saldo.
- GHL sin scopes.
- Calendar ID incorrecto.
- Buffer cron no ejecuta.
- RLS bloquea datos.
- Handoff no apaga IA.
- Template rechazado.

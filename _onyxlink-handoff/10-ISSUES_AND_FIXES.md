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

### Issue 3

Fecha:

2026-07-05

Descripción:

El agente no podía consultar disponibilidad ni agendar en Google Calendar.
Tanto `check_availability_google` como `schedule_google` fallaban en cada
llamada con el error `Invalid time zone specified` (visible en los logs de
Vercel como una tool con `"error":"Invalid time zone specified"`), y en el
chat de WhatsApp el agente respondía "tengo un problema técnico para
consultar la disponibilidad".

Causa:

El campo "Zona horaria" en `Settings → Integraciones → Google Calendar` es
texto libre sin validación. Se guardó como
`"Zona horaria de Madrid (GMT+2)"` en vez del identificador IANA real
(`Europe/Madrid`). `google-calendar-client.ts` pasa ese valor directo a
`Intl.DateTimeFormat(..., { timeZone })`, que lanza `RangeError: Invalid
time zone specified` en cuanto el string no es un nombre de zona horaria
IANA válido — y eso rompe tanto el cálculo de huecos libres como la
creación del evento.

Fix aplicado:

1. Se corrigió el valor directamente en `integrations.config.timezone` del
   workspace afectado, de `"Zona horaria de Madrid (GMT+2)"` a
   `"Europe/Madrid"`.
2. Se agregó validación server-side en
   `src/app/api/workspace/[id]/integrations/route.ts` (PUT): si
   `provider === "google_calendar"` y viene `config.timezone`, se prueba con
   `new Intl.DateTimeFormat("en-US", { timeZone: tz })` antes de guardar; si
   lanza, se devuelve 400 con un mensaje claro en vez de guardar un valor que
   rompería las tools en tiempo de ejecución.
3. Se añadió una nota bajo el campo en la UI (`integrations-tab.tsx`)
   aclarando que debe ser un identificador IANA (`Europe/Madrid`,
   `America/Mexico_City`), no una descripción.

Resultado:

Desplegado a producción. Consultar disponibilidad ya funcionó correctamente en
una prueba real de WhatsApp (ver Issue 4 para el problema de agendamiento que
apareció después).

### Issue 4

Fecha:

2026-07-05

Descripción:

Tras arreglar el Issue 3, "Consultar disponibilidad" ya funcionaba en
WhatsApp, pero el agente seguía sin agendar la cita: decía "no puedo hacer
la reserva directamente" y ofrecía un "[Enlace de reserva]" que no llevaba a
ningún sitio real.

Causa:

No era un bug de código — las tools `check_availability_google` y
`schedule_google` ya estaban activas y funcionando (confirmado en
`tool_configs`). El problema estaba en los **prompts publicados** de los
modos `setter` (Carlos) y `agendamiento` (Andrés): se escribieron antes de
que existiera la integración de Google Calendar, así que instruían
explícitamente al agente a "nunca decir que ya agendaste" y a "ofrecer el
enlace de agenda" — un enlace que corresponde a la tool "Agendamiento por
link" (`schedule_link`), que está desactivada. El modelo seguía la
instrucción del prompt al pie de la letra: consultaba disponibilidad (tool
nueva, sí mencionada) pero para agendar cumplía la instrucción vieja de
"pasa el enlace", y al no haber enlace configurado, lo alucinó.

Fix aplicado:

Se publicó una nueva versión de ambos prompts (`setter` v7, `agendamiento`
v5) reemplazando la sección de citas: ahora indican explícitamente que el
agente SÍ puede agendar directamente con la tool "Agendar en Google
Calendar" tras consultar disponibilidad, y que no debe ofrecer ningún
enlace porque no hay ninguno activo. Los archivos de referencia
`PROMPT_CARLOS_MEJORADO.md` y `PROMPT_ANDRES_MEJORADO.md` en
`CLIENTES/onyxlink/whatsapp-agent-workspace/` se actualizaron para que
coincidan con lo publicado.

Resultado:

**Este fix no fue suficiente por sí solo — ver Issue 5.** El agente activo
del workspace no era ninguno de estos dos.

### Issue 5

Fecha:

2026-07-05

Descripción:

Después de publicar el fix del Issue 4, el agente seguía sin agendar y
seguía ofreciendo un enlace inexistente, exactamente igual que antes.

Causa:

El fix del Issue 4 se aplicó a los prompts de los modos `setter` (Carlos) y
`agendamiento` (Andrés) — pero el agente marcado como **activo**
(`agents.is_active = true`) en este workspace es **`soporte` (Sofía)**.
`getActiveAgent()` en `src/features/agents/services/active-agent.ts` lee el
único agente con `is_active = true` por workspace y `resolveSystemPrompt()`
usa `{ mode: activeAgent.type }`, así que todo el tráfico real de esta
conversación se resolvía contra el prompt de Sofía — que tenía la misma
instrucción obsoleta ("no puedes crear ni confirmar citas directamente...
ofrece enlace de agenda") y nunca se había tocado.

Confirmado consultando `agents` directamente: `soporte` (Sofía) tenía
`is_active: true`, mientras `setter` (Carlos) y `agendamiento` (Andrés)
tenían `is_active: false`.

Fix aplicado:

Se publicó una nueva versión del prompt de `soporte` (v8) con la misma
sección de citas corregida (agendar directo por Google Calendar, sin
enlace). Se sincronizó `PROMPT_SOFIA_MEJORADO.md`.

De paso, se detectó un segundo problema real al revisar los logs de la
tabla `events`: la tool `check_availability_google` se llamó dos veces con
los mismos argumentos (`date_from=date_to=2026-07-06`), ambas con
`result_ok: true` y sin ningún periodo ocupado real en el calendario (se
verificó con una llamada directa a `freeBusy` fuera de la app) — pero en la
segunda respuesta el agente le dijo al usuario "hasta las 15:30" en vez del
rango real (9:00–17:30). No fue un bug de datos: el modelo resumió mal un
resultado de tool que sí era correcto. Se publicó v9 del prompt de Sofía
añadiendo la instrucción explícita de reportar el rango exactamente como lo
devuelve la tool, sin redondear ni acortarlo.

Resultado:

Pendiente confirmar con una prueba real de agendamiento por WhatsApp usando
el agente activo (Sofía).

**Lección para la próxima vez:** cuando se corrige un prompt por un problema
de comportamiento, primero hay que confirmar **cuál agente está realmente
activo** (`agents.is_active = true` en ese workspace) antes de asumir que es
el que "debería" estar manejando la conversación por el contexto de la
charla — de lo contrario se puede arreglar el prompt equivocado y el
síntoma persiste sin motivo aparente.

### Issue 6

Fecha:

2026-07-06

Descripción:

Un cliente con su propia API key de OpenRouter configurada en
`Settings → Integraciones → OpenRouter` seguía generando consumo en la
cuenta de OpenRouter de la plataforma (Onyxlink), no en la suya.

Causa:

`getOpenRouterApiKey(workspaceId)` (en `openrouter.ts`) sí resuelve
correctamente la key del workspace con fallback a la de plataforma, y ya la
usaban las respuestas de chat y la comprensión de audio/imagen
(`media-understanding.ts`). Pero dos rutas de gasto reales la ignoraban por
completo y llamaban siempre a `process.env.OPENROUTER_API_KEY` directo:

- `kb-service.ts`: embeddings al subir documentos a la Knowledge Base y en
  cada búsqueda semántica (`searchKb`).
- `setter.ts`: la evaluación/calificación de leads en modo setter
  (`evaluateLead`).

Fix aplicado:

Ambos archivos ahora reciben la API key resuelta vía
`getOpenRouterApiKey(workspaceId)` (mismo helper, mismo fallback a la key de
plataforma si el workspace no configuró la suya) en vez de leer la variable
de entorno directamente. `evaluateLead` ahora acepta `workspaceId` como
parámetro opcional; su única llamada (en `buffer.ts`, evaluación de setter)
ya tenía `workspaceId` disponible en scope.

Resultado:

Desplegado a producción. A partir de ahora, un workspace con su propia key
de OpenRouter configurada factura ahí el 100% de su consumo: chat, audio/
imagen, embeddings de KB y scoring de setter — no solo las respuestas del
chat.

**Lección para la próxima vez:** cuando se agregue una llamada nueva a un
proveedor de IA, usar siempre el helper centralizado de resolución de key
(`getOpenRouterApiKey`) en vez de leer la variable de entorno directo — es
fácil que una ruta nueva se cuele sin la resolución por workspace y termine
facturando a la cuenta equivocada sin que se note hasta revisar el consumo.

### Issue 7

Fecha:

2026-07-06

Descripción:

Auditoría de seguridad pedida por el usuario ("¿la app está protegida de
hackers?"). Se encontró que `integrations.credentials` (API key de YCloud,
webhook signing secret, API key de OpenRouter, PIT de HighLevel) se
guardaba en **texto plano** en la base de datos.

Causa:

`ENCRYPTION_KEY`/`ENCRYPTION_KEY_VERSION` existían en `.env.local` con el
comentario explícito "Encryption key for tenant credentials at rest
(SEC-03)", y `src/shared/lib/crypto.ts` ya tenía un helper AES-256-GCM
correctamente implementado (IV aleatorio por operación, cifrado
autenticado) — pero **nunca se llamaba desde ningún lado**. SEC-03 se
planeó pero nunca se conectó al flujo real de guardar/leer integraciones.

De paso, se encontró una segunda cosa: `kb-service.ts` tenía una función de
respaldo (`searchKbFallback`) que arma una consulta SQL pegando texto
directamente (workspace_id y el vector de embedding interpolados en un
string) y la manda a una RPC `execute_sql` que **nunca existió** en las
migraciones — código muerto e inalcanzable hoy, pero con forma de inyección
SQL real si algún día alguien creara esa RPC sin notar este llamador.

Fix aplicado:

1. Se agregaron `encryptCredentials`/`decryptCredentials` a `crypto.ts`.
   `decryptCredentials` detecta por forma si un valor ya está cifrado
   (`iv:ciphertext:version`) o es texto plano legado, y lo deja pasar tal
   cual si no lo reconoce — migración sin downtime, sin necesitar tocar cada
   fila manualmente.
2. Se conectó en los 9 puntos reales que leen o escriben credenciales:
   `Settings → Integraciones` (GET/PUT), los dos webhooks (verificación de
   firma de YCloud, comparación de token de HighLevel), `dispatch.ts`,
   `templates.ts` (listar + enviar), `openrouter.ts`, `highlevel-client.ts`.
3. Se re-cifraron directamente las 2 filas reales que ya existían en
   producción (YCloud, OpenRouter del workspace de Onyxlink) para que la
   protección aplique de inmediato, no solo la próxima vez que alguien
   guarde el formulario.
4. Se eliminó `searchKbFallback` y la referencia a `execute_sql`.

Resultado:

Desplegado a producción. Verificado que el descifrado de las credenciales
ya re-cifradas devuelve el valor original correcto.

**Lección para la próxima vez:** una variable de entorno o un helper de
seguridad que existe en el repo no significa que esté aplicado — hay que
verificar que de verdad se llama desde el código, no solo que está
declarado. Cuando se audite seguridad, buscar los helpers de
seguridad (`grep` del nombre de la función) y confirmar quién los invoca de
verdad.

### Issue 8

Fecha:

2026-07-06

Descripción:

Al redactar la política de retención y borrado de datos (propuesta de
mejoras), se detectó que borrar un cliente desde el panel de agencia no
borraba de verdad todos sus datos.

Causa:

`deleteWorkspaceForClient` solo borraba la fila de `workspaces`, que
efectivamente elimina en cascada todas las tablas con FK hacia ella
(mensajes, contactos, prompts, credenciales, etc.). Pero los archivos del
bucket de Storage `whatsapp-media` (audios, imágenes) no están referenciados
por ninguna foreign key — son solo un prefijo de ruta
(`{workspaceId}/{conversationId}/{archivo}`) — así que quedaban huérfanos en
Storage para siempre después de "eliminar" un cliente.

Fix aplicado:

Se agregó `deleteWorkspaceMedia()` en `media-handler.ts`: lista cada carpeta
de conversación bajo el prefijo del workspace (Supabase Storage marca las
carpetas con `id: null` en la respuesta de `list()`), junta las rutas de
archivo reales, y las borra en lotes de 100. Es best-effort: un error de
listado o borrado en Storage queda registrado pero nunca bloquea el borrado
del workspace en sí. Se verificó el recorrido de carpetas/archivos contra el
bucket real en modo solo-lectura (sin borrar nada) antes de conectarlo al
flujo de borrado.

Resultado:

Desplegado a producción. La política de retención ya puede afirmar, sin
mentir, que borrar un workspace borra también sus archivos multimedia.

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

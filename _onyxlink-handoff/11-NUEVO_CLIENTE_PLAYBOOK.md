# 11 - PLAYBOOK: ALTA DE UN CLIENTE NUEVO

## Objetivo

La instalación técnica (Supabase, Vercel, migraciones, super admin, cron) es de
**una sola vez para toda la plataforma**. Para dar de alta un cliente nuevo NO
se repite nada de eso — solo se sigue este playbook, dentro de la app ya
desplegada.

Tiempo estimado por cliente: 5-10 minutos.

## Antes de empezar

Ten a mano del cliente:

- Nombre del negocio y datos de contacto (email para su login).
- Cuenta de YCloud del cliente (o créala tú y luego pásale el acceso) con su
  número de WhatsApp Business ya conectado — ver `05-YCLOUD_FIRST_WORKSPACE.md`
  para el detalle de ese proceso (Meta Business Suite + WABA + coexistencia).
- Información de su negocio: horarios, servicios, precios, políticas, FAQs.
- Personalidad/tono que quiere para su agente.
- (Opcional) Su propia API key de OpenRouter, si va a pagar su propio consumo
  de IA en vez de usar la key global de la plataforma.

## Pasos

**1. Entra al panel de agencia** con el super admin →
`https://<tu-url-de-produccion>/workspaces`.

**2. Dale click a "Nuevo cliente" / "Dar de alta cliente".**
La app crea el workspace y genera credenciales de login para el cliente al
instante (email + contraseña). **Cópialas y guárdalas de forma segura** — no
se vuelven a mostrar. También te da la **URL de webhook** de YCloud para este
workspace (trae su `wsid` único).

**3. Conecta YCloud** (dentro del workspace nuevo → `Settings → Integraciones →
YCloud`):
   - API Key de YCloud del cliente.
   - Webhook Signing Secret.
   - Número de WhatsApp en formato E.164.
   - Pega la URL de webhook (la del paso 2) en YCloud → Webhooks, activa el
     endpoint, y marca los eventos: `whatsapp.mensaje_entrante.recibido` y
     `Mensaje de WhatsApp actualizado` (los únicos que procesa el código
     actual — no hace falta marcar más).
   - Dale **Guardar** primero, luego **Probar conexión** (el test lee lo
     guardado en base de datos, no lo que está sin guardar en el formulario).

**4. Carga la info del negocio** (`Settings → Negocio`): nombre, horarios,
industria, país, zona horaria, y el campo de texto libre para lo demás.

**5. Escribe y publica el prompt** (`Settings → Agentes`): personalidad, tono,
reglas de qué puede/no puede prometer, cuándo hace handoff a un humano.

**6. (Opcional) Sube Knowledge Base** (`Settings → Knowledge Base`): catálogos,
tablas de precios, políticas largas, FAQs — se buscan por similitud semántica,
no hace falta meterlas en el prompt.

**7. (Opcional) OpenRouter propio** (`Settings → Integraciones → OpenRouter`):
si el cliente va a pagar su propio consumo de IA, pega su key ahí. Si se deja
vacío, usa automáticamente la key global de la plataforma.

**8. Activa las tools que necesite** (`Settings → Tools`): agendamiento
(Calendly/link), HighLevel, etc. — solo las que apliquen a ese cliente.

**9. Prueba real de punta a punta**: desde otro teléfono, manda un WhatsApp al
número del cliente. Espera ~1 minuto (el cron corre cada minuto). Confirma que
responde la IA y que la conversación aparece en `/inbox` del workspace.

> ⚠️ **Si el agente no responde y en Vercel ves `401` en
> `/api/webhooks/ycloud`**: revisa que la URL del webhook en YCloud tenga el
> `wsid` del workspace **actual** — cada workspace nuevo tiene un `wsid`
> distinto. Si se borró y recreó un workspace (o se reconectó un número a otro
> workspace), la URL vieja queda huérfana y YCloud reintenta contra un `wsid`
> que ya no existe. Copia la URL fresca desde `Settings → Integraciones →
> YCloud → Webhook URL` de ese workspace y actualízala en YCloud. Ver Issue 2
> en `10-ISSUES_AND_FIXES.md`.

**10. Entrega las credenciales al cliente** para que entre a ver su propio
inbox, o gestiona tú el workspace por él, según el acuerdo comercial.

## Lo que nunca hay que volver a tocar por cliente nuevo

- Supabase (proyecto, migraciones, Site URL).
- Vercel (deploy, variables de entorno globales).
- El cron del buffer (ya corre para todos los workspaces).
- Crear un repo nuevo — **nunca** se crea un repo por cliente, todo vive en la
  misma instalación multi-tenant.

## Referencia

Ver también `05-YCLOUD_FIRST_WORKSPACE.md`, `06-OPENROUTER_AGENT_CONFIG.md`,
`07-HIGHLEVEL_OPTIONAL.md` y `08-SMOKE_TESTS.md` para el detalle de cada
sub-paso.

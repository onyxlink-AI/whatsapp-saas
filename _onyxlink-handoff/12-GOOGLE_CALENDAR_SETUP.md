# 12 - GOOGLE CALENDAR SETUP

## Modelo de autenticación

Una sola **cuenta de servicio de Google** para toda la plataforma (se crea
**una vez**, no por cliente). Cada cliente solo comparte su propio Google
Calendar con el email de esa cuenta de servicio — igual de simple que pegar un
token de HighLevel, pero sin guardar ningún secreto por workspace.

## Parte 1 — Crear la cuenta de servicio (una sola vez, hace Onyxlink)

1. Ve a https://console.cloud.google.com/ → crea un proyecto (o usa uno
   existente).
2. **APIs y servicios → Biblioteca** → busca "Google Calendar API" → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
   - Nombre: algo como `onyxlink-calendar`.
   - No hace falta asignarle roles de proyecto.
4. Entra a la cuenta de servicio creada → pestaña **Claves** → **Agregar
   clave → Crear clave nueva → JSON**. Se descarga un archivo `.json`.
5. Del JSON descargado, necesitas 2 campos:
   - `client_email` → va en `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
   - `private_key` → va en `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (pégalo tal
     cual, con los `\n` literales — el código los convierte a saltos de línea
     reales).
6. Guarda esas 2 variables en `.env.local` y en Vercel (`node scripts/setup.mjs
   vercel-env` las sube si ya están en `.env.local`).

**Nunca subas el archivo `.json` descargado a Git.** Solo copia esos 2 valores
a las variables de entorno.

## Parte 2 — Por cada cliente (repetible)

1. El cliente entra a **calendar.google.com** con la cuenta donde quiere que
   se agenden las citas.
2. **Configuración del calendario** (⚙️ → el calendario específico) →
   **Compartir con determinadas personas** → agrega el email de la cuenta de
   servicio (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) con permiso **"Hacer cambios en
   eventos"**.
3. En esa misma pantalla, copia el **ID de calendario** (sección "Integrar
   calendario" — normalmente es su email si es su calendario principal, o un
   ID largo terminado en `@group.calendar.google.com` si es un calendario
   secundario).
4. En la app: `Settings → Integraciones → Google Calendar` → pega el Calendar
   ID, ajusta zona horaria y horario laboral si hace falta → **Guardar** →
   **Probar conexión**.

## Tools que usa

- **Consultar disponibilidad (Google Calendar)** (`check_availability_google`):
  calcula huecos libres dentro del horario laboral configurado, usando
  `freeBusy.query` de Google para descartar los ocupados.
- **Agendar en Google Calendar** (`schedule_google`): crea el evento
  directamente vía `events.insert`.

Actívalas en `Settings → Tools` como cualquier otra.

## Troubleshooting

- **"Google Calendar no accesible" / errors en freeBusy**: el calendario no
  se compartió con la cuenta de servicio, o se compartió con el permiso
  incorrecto (debe ser al menos "Hacer cambios en eventos" para poder
  agendar).
- **Token exchange failed**: revisa que `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  se haya pegado completo, incluidas las líneas `BEGIN/END PRIVATE KEY`.
- **Los huecos no coinciden con el horario real del cliente**: revisa
  `timezone` y `business_hours_start/end` en la config del workspace — son
  configurables por cliente, no hay un horario global.

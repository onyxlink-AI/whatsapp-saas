# Checklist: Agenda, Google Calendar y Zoom al dar de alta un cliente nuevo

**Propietario:** NexorLabs / OnyxLink
**Frecuencia:** Cada vez que se da de alta un workspace de cliente nuevo que vaya a usar la Agenda real del especialista (agendar citas/llamadas)
**Última actualización:** 31 de julio de 2026
**Origen:** errores reales encontrados y corregidos en la sesión del 30–31 de julio de 2026, construyendo la Agenda real + sincronización con Google Calendar + Zoom

## 1. Objetivo

Que un cliente nuevo no repita los mismos problemas que aparecieron probando
esto por primera vez. Nada de lo de aquí es un bug pendiente — el código ya
maneja todo esto de forma segura — pero son limitaciones de arquitectura o
decisiones de configuración que hay que tener presentes al dar de alta a
alguien.

## 2. Google Calendar (config propia de cada cliente)

- [ ] El cliente comparte **su propio** Google Calendar (no el de Onyxlink)
      con la cuenta de servicio (`GOOGLE_SERVICE_ACCOUNT_EMAIL`), permiso
      "Hacer cambios en eventos".
- [ ] Su Calendar ID se guarda en Ajustes → Integraciones → Google Calendar
      de **su propio workspace** — no confundir con el calendario usado
      durante las pruebas internas (`onyxlink.ai@gmail.com`).
- [ ] **Limitación conocida:** el enlace automático de Google Meet no
      funciona con una cuenta de Gmail normal — solo con Google Workspace y
      delegación de dominio configurada (Google devuelve
      `Invalid conference type value`). El código ya cae de forma segura a
      "cita creada sin enlace de Meet" en ese caso, así que esto nunca rompe
      la Agenda — pero significa que casi ningún cliente nuevo tendrá enlace
      automático de Meet a menos que ya tenga Workspace. Para enlace real,
      ver Zoom más abajo.

## 3. Zoom — es UNA sola cuenta compartida, no una por cliente

- [ ] Zoom no funciona como Google Calendar. Usa una única cuenta de Zoom de
      la plataforma (`ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`,
      configuradas una sola vez en Vercel) — el cliente **no** conecta su
      propio Zoom.
- [ ] Por cliente, solo se configura en Ajustes → Integraciones → Zoom qué
      usuario de esa misma cuenta de Zoom de Onyxlink actúa como anfitrión
      (`host_email`) de sus reuniones.
- [ ] **Importante para vender esto bien:** las reuniones de todos los
      clientes que usen Zoom quedan organizadas bajo la cuenta de Zoom de
      Onyxlink, no bajo una cuenta propia del cliente. Si un cliente concreto
      necesita que las reuniones salgan a su propio nombre/marca en Zoom,
      esta arquitectura no lo permite tal cual — haría falta una app
      Server-to-Server independiente para ese cliente (no construido).
- [ ] El email del anfitrión debe ser un usuario real que exista dentro de
      la cuenta de Zoom de Onyxlink. Probar siempre con el botón
      "Probar conexión" antes de darlo por bueno — si Zoom devuelve un error
      de scopes ("does not contain scopes..."), falta añadir ese scope en la
      app de Zoom (marketplace.zoom.us → tu app → Scopes).

## 4. Orquestador — instrucciones personalizadas (por cliente)

- [ ] Si el cliente quiere personalizar el comportamiento del Coordinador
      (Orquestador → Modelos de especialistas → Instrucciones
      personalizadas), **evitar frases genéricas tipo "pide aprobación antes
      de cualquier acción sobre citas/calendario"**. Esa redacción hace que
      el Coordinador dude y prepare "borradores pendientes de confirmación"
      en vez de crear directamente una cita que el propio dueño ya pidió
      explícitamente en su mensaje.
- [ ] Si el cliente sí quiere una capa de seguridad, que sea específica —
      por ejemplo "pide aprobación para cancelar o mover una cita ya
      existente", nunca para crear una cita nueva que él mismo acaba de
      confirmar.

## 5. Verificación rápida al terminar de configurar un cliente

- [ ] Pedirle al especialista de Agenda que agende una cita con hora
      concreta (ej. "agenda una llamada con [nombre] mañana a las 11").
- [ ] Confirmar que aparece en Proyectos → Agenda, tanto en vista **Día**
      como en vista **Semana**.
- [ ] Confirmar que aparece también en el Google Calendar del cliente, si
      lo tiene conectado.
- [ ] Confirmar que trae un enlace de reunión (Zoom, si está conectado) —
      si no hay Zoom conectado, que no traiga enlace es correcto, no un
      fallo.
- [ ] Confirmar que el título y las notas de la tarea son legibles: frase
      corta y humana, sin fechas en formato técnico (ISO/offset) ni
      instrucciones internas del especialista filtrándose al texto.

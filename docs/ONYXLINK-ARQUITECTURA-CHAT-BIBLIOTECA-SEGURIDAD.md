# OnyxLink — Arquitectura de Chat de equipo, biblioteca de módulos y seguridad

**Estado:** especificación para Claude Code; no implementar todo en un único cambio.  
**Objetivo:** añadir mensajería interna compacta, límites de equipo por contrato y navegación visual de módulos sin debilitar el aislamiento multiempresa.

## 1. Decisiones cerradas

1. La V1 será un Chat de equipo nativo sobre Supabase, no un clon completo de Slack.
2. V1 incluye texto en tiempo real, canal General, mensajes directos, no leídos y búsqueda básica.
3. V1 se construye primero sin documentos ni vídeo. Documentos forman la V1.1 y videollamadas la V2, tras medir carga real.
4. V1 excluye historias, bots, bridges, hilos y federación.
5. El límite contractual se aplica a miembros humanos activos del workspace, no solo a una pantalla. Superadministradores de OnyxLink no consumen plaza.
6. Valores iniciales sugeridos: Gestión = 1 persona; Gestión + WhatsApp = 2; Suite = 4. El superadministrador puede fijar el límite efectivo por empresa.
7. El límite se hace cumplir en base de datos de forma transaccional, además de API y UI.
8. Proyectos y Contenido mantienen sus pestañas superiores y añaden una biblioteca visual inferior usando las mismas vistas `?view=`.
9. ELK/Elastic será observabilidad minimizada, nunca base de datos de negocio ni frontera primaria entre clientes.
10. Matrix se reserva para una edición futura de alta seguridad; no es requisito del Chat V1.

## 2. Encaje con el sistema actual

- Tenant: `workspaces`.
- Usuarios y roles: `memberships`, con `admin | manager | agent | viewer` e `is_active`.
- Autorización: `requireWorkspaceMember`, `requireSuperAdmin` y `ROLE_RANK`.
- Productos actuales: flags de `workspaces`; `package_tier` se deriva, no se persiste.
- Proyectos: `/proyectos?view=projects|tasks|agenda|board|notes|pipeline`.
- Contenido: `/contenido?view=pipeline|ideas|scripts`.
- Realtime existente: patrón de Inbox con Supabase `postgres_changes`.

No reutilizar `messages` ni `conversations`: pertenecen a WhatsApp y tienen otra semántica.

## 3. Entitlements y plazas

Añadir a `workspaces`:

- `team_chat_enabled boolean not null default false`.
- `human_member_limit smallint not null default 1`, con rango seguro, por ejemplo `1..500`.

El límite cuenta membresías activas cuyos usuarios no sean superadministradores. Al invitar, reactivar o transferir una plaza:

1. bloquear el workspace o usar una función transaccional;
2. contar plazas activas;
3. rechazar con código estable `TEAM_SEAT_LIMIT_REACHED` si no existe plaza;
4. crear/reactivar la membresía solo dentro de la misma transacción.

Un conteo previo en React o API no es suficiente porque admite carreras concurrentes.

Superficies:

- Superadministrador, Ajustes → Negocio: activar Chat y definir plazas.
- Ajustes → Equipo y Mi equipo: indicador `ocupadas / contratadas`.
- Invitación desactivada visualmente cuando se llena el cupo, con mensaje claro.
- Panel `/workspaces`: badge de Chat y contador de plazas.
- El cliente no puede subir su propio límite.

## 4. Modelo de Chat V1

### `team_channels`

- `id`, `workspace_id`, `name`.
- `kind`: `general | direct`.
- `created_by`, `direct_key`, `created_at`, `updated_at`.
- Un único canal General por workspace.
- Para DM, `direct_key` canónica y única por workspace y pareja de usuarios.

### `team_channel_members`

- `channel_id`, `workspace_id`, `user_id`.
- `joined_at`, `last_read_at`.
- Clave/constraint que impida relacionar canal y miembro de workspaces distintos.

### `team_messages`

- `id`, `workspace_id`, `channel_id`, `sender_id`.
- `body` como texto plano, longitud máxima definida.
- `created_at`, `edited_at`, `deleted_at`.
- Sin borrado físico desde cliente; mostrar “Mensaje eliminado”.
- Índice de paginación `(channel_id, created_at desc, id desc)`.

Todas las relaciones deben validar en base de datos que canal, remitente y participante pertenecen al mismo workspace y siguen activos.

## 5. RLS y autorización

- Leer canal/mensajes: usuario autenticado, membership activa del workspace y participación en el canal.
- Insertar: `sender_id = auth.uid()`, membership activa, participante y Chat habilitado.
- Editar/eliminar lógico: solo autor; moderación de admin debe quedar auditada.
- Crear DM/invitar participante: ambos usuarios activos en el mismo workspace.
- Nunca aceptar `workspace_id` del navegador como prueba de autoridad.
- Nunca usar service role en cliente. Si una API usa service role, ejecutar primero el guard del workspace.
- Añadir solo `team_messages` a Realtime; suscripción filtrada por canal y protegida por RLS.
- Paginación por cursor, rate limit por usuario/workspace y límite de longitud.
- Renderizar texto, nunca HTML introducido por usuarios.

Corregir antes o durante esta fase la política global `users_select_authenticated`: un autenticado no debe enumerar perfiles de empresas ajenas. Permitir solo perfil propio, usuarios que compartan workspace activo y superadministradores.

## 6. UX del Chat

Entrada visible: **Chat de equipo**, dentro de Gestión/Trabajo diario, solo si `team_chat_enabled`.

Escritorio:

- izquierda: General y mensajes directos;
- centro: conversación, carga histórica y compositor;
- derecha opcional: miembros activos/detalle compacto.

Móvil:

- una vista cada vez;
- listado → conversación con botón Atrás;
- compositor por encima de navegación inferior y `safe-area`.

Estados obligatorios: vacío, cargando, sin conexión, reconectando, error, cuota llena, usuario desactivado y mensaje eliminado. Los no leídos se calculan con `last_read_at`; presencia y “escribiendo…” quedan fuera de V1.

## 6.1 Documentos — V1.1

Los archivos nunca se guardan dentro de Postgres. Postgres conserva únicamente metadatos; el binario vive en Supabase Storage.

- Bucket privado `team-chat-files`, jamás público.
- Ruta: `<workspace_id>/<channel_id>/<message_id>/<uuid>-<safe_name>`.
- Tabla de adjuntos con workspace, canal, mensaje, uploader, object path, nombre, MIME, bytes, hash y timestamps.
- RLS exige membership activa, participación en el canal y coincidencia exacta de workspace.
- Descarga autenticada o URL firmada muy corta; no persistir URLs firmadas.
- Allowlist de tipos; bloquear ejecutables, HTML/SVG activo y formatos peligrosos.
- Límite inicial: 10 MB por archivo y cuota mensual por workspace, configurable por contrato.
- Escaneo antimalware en cuarentena antes de permitir la descarga.
- Subidas reanudables TUS para archivos mayores de 6 MB.

Los documentos no viajan por Realtime: solo se emite el evento pequeño del adjunto ya validado.

## 6.2 Videollamadas — V2

Supabase no transporta audio ni vídeo. Solo autoriza la sala y guarda metadatos mínimos. El tráfico multimedia debe ir por WebRTC mediante un SFU separado.

Recomendación: LiveKit, autohospedado o gestionado con región fijada, embebido dentro de OnyxLink. El usuario no sale visualmente del panel aunque la infraestructura de medios sea independiente.

- Botón “Llamar” dentro de General o DM.
- Backend verifica workspace, canal, membership y entitlement antes de emitir un JWT de sala de TTL muy corto.
- Nombre de sala opaco y no predecible.
- Sin grabación, transcripción ni envío de audio a IA en la primera versión.
- E2EE de medios cuando el flujo elegido lo soporte, con gestión explícita de claves.
- TURN, firewall, métricas y pruebas de carga separados de Vercel/Supabase.
- Cuota contractual por minutos, concurrencia y máximo de participantes.

No implementar vídeo P2P artesanal. Para grupos, un SFU es la frontera operativa correcta y también evita convertir Supabase en servidor multimedia.

## 6.3 Capacidad y crecimiento

Separar siempre cuatro recursos:

1. Postgres: texto, membresías, canales y metadatos.
2. Storage: documentos.
3. Realtime Broadcast: entrega instantánea y eventos ligeros.
4. LiveKit/WebRTC: audio y vídeo.

Usar Broadcast privado en vez de Postgres Changes para cada mensaje; una conexión WebSocket por sesión; canales solo para conversaciones abiertas; paginación por cursor; índices por canal/fecha; retención por contrato y métricas de conexiones, eventos/s, CPU, RAM, IOPS, DB, Storage y egress.

No ampliar Supabase a ciegas: load test y alertas al 60/75/90 %. Subir compute cuando CPU, memoria o conexiones lo exijan; subir disco/IOPS cuando el cuello sea almacenamiento. Los clientes de alta criticidad pueden recibir proyecto Supabase, Storage y medios dedicados.

## 7. Biblioteca visual de módulos

Crear un componente compartido `ModuleLibrary` que reciba metadatos de vista y el callback ya usado por Tabs.

Proyectos:

- Proyectos, Tareas, Agenda, Board, Anotaciones y Oportunidades.
- Ocultar Board/Oportunidades cuando el entitlement no exista.

Contenido:

- Pipeline, Ideas y Guiones.

Reglas:

- Las pestañas superiores permanecen.
- Las tarjetas inferiores actualizan el mismo `?view=`; no crear rutas ni estados duplicados.
- La tarjeta activa tiene `aria-current` y contraste claro.
- Extraer `VALID_VIEWS` y metadatos a un único archivo por módulo para evitar divergencia servidor/cliente.
- Escritorio: dock o bento compacto al final del área, no una segunda página.
- Móvil: carrusel horizontal sobre la navegación inferior con `safe-area`.
- Una tarjeta abre exclusivamente su vista; historial, deep links y botones Atrás/Adelante deben seguir funcionando.

## 8. Matrix — decisión y arquitectura futura

Matrix es válido si OnyxLink decide operar un sistema completo de mensajería. No sustituye por sí mismo el aislamiento multi-tenant.

Para una edición futura:

- Synapse autohospedado.
- Sin federación, bridges, registro público ni previews de URL.
- Dominio registrado separado del panel para reducir impacto de XSS de contenido.
- Reverse proxy TLS; Postgres y Admin API en red privada.
- OIDC centralizado y offboarding que revoque sesiones/dispositivos.
- Salas privadas y E2EE obligatorio.
- El límite de plazas sigue controlado transaccionalmente por OnyxLink y se replica en Synapse.
- Backups cifrados y restauraciones ensayadas, incluyendo la precaución oficial sobre claves E2E de un solo uso.
- Para clientes críticos: homeserver y PostgreSQL dedicados.

E2EE protege el contenido, no toda la metadata de cuentas, dispositivos, salas, membresías y tráfico. No prometer invisibilidad absoluta al servidor.

## 9. ELK / Elastic — arquitectura “búnker”

Se asume que ELK significa Elastic Stack; confirmar antes de desplegar.

- Panel y Supabase siguen siendo la fuente de verdad.
- App → colector privado → pipeline de allowlist/redacción → Elastic.
- Elasticsearch nunca expuesto a Internet; Kibana solo por VPN/ZTNA, SSO y MFA.
- TLS HTTP e internodo; cifrado de disco y snapshots.
- Claves de API por servicio/entorno, mínimo privilegio, expiración y rotación.
- Prohibido ingerir cuerpos de chat/WhatsApp, documentos, Authorization, cookies, tokens, claves, URLs firmadas o secretos webhook.
- Pseudonimizar workspace/usuario cuando sea suficiente.
- Índice/data stream por workspace o tier; para clientes críticos, cluster separado.
- No usar Kibana Spaces, aliases filtrados o DLS como única barrera tenant.
- Auditoría de Elastic/Kibana enviada a un entorno independiente e inmutable.
- ILM y retención mínima por clase de log; snapshots cross-account con restauración probada.
- Verificar licencia antes de depender de DLS/FLS, audit logging o `redact` processor.

## 10. Plan de implementación para Claude Code

### Fase A — contratos y seguridad de equipo

1. Migración de flags/límite y función transaccional de plazas.
2. Endurecer política de lectura de `users`.
3. Integrar límite en invitación/reactivación y ajustes superadmin.
4. Pruebas A/B, carrera de última plaza, superadmin excluido y desactivación.

### Fase B — Chat V1: prioridad inmediata

1. Migración de canales, miembros y mensajes con constraints, RLS y Realtime.
2. Acciones/API con guards, rate limit, cursores y errores estables.
3. General, DM, no leídos y borrado lógico.
4. UI escritorio/móvil y navegación.
5. Pruebas de aislamiento, realtime, reconexión, cuota y offboarding.

Detenerse aquí y medir capacidad antes de continuar.

### Fase B.1 — documentos

1. Bucket privado, tabla de adjuntos y cuarentena.
2. Cuotas por workspace, allowlist, límites y escaneo.
3. Descargas autenticadas y pruebas de fuga A/B.

### Fase B.2 — videollamada interna

1. Prueba de concepto LiveKit independiente.
2. Tokens server-side, salas por canal y expulsión/offboarding.
3. Pruebas de TURN, E2EE, carga, observabilidad y costes.
4. Activar solo si supera criterios de capacidad y seguridad.

### Fase C — biblioteca de módulos

1. Extraer catálogos de vistas.
2. Crear `ModuleLibrary` compartida.
3. Integrar en Proyectos y Contenido respetando flags y URL.
4. Auditoría visual escritorio/móvil y accesibilidad.

### Fase D — hardening y observabilidad

1. Threat model formal y matriz de datos permitidos en logs.
2. Logger estructurado con allowlist y pruebas canario de secretos/PII.
3. Rate limits, alertas y runbooks de revocación/incidentes.
4. Pentest independiente antes de incorporar clientes de alta criticidad.

Matrix y Elastic se diseñan/despliegan como proyectos de infraestructura separados después de las fases anteriores; no mezclarlos con el MVP del Chat.

## 11. Criterios de aceptación innegociables

- Un usuario A no puede descubrir canales, perfiles, mensajes, presencia ni contadores de B.
- Manipular IDs/workspace en URL, payload o Realtime devuelve cero datos o 403.
- Dos invitaciones concurrentes no superan el límite.
- Desactivar a un miembro corta Chat y nuevas lecturas/escrituras inmediatamente.
- Ningún secreto o cuerpo de mensaje llega a logs/Elastic.
- No existen endpoints administrativos públicos.
- Tests de RLS se ejecutan con JWT reales de dos empresas, no solo service role.
- Backups y restauración se prueban; no basta comprobar que el archivo existe.
- Dependencias se parchean y escanean; pentest externo antes de clientes críticos.
- No describir el sistema como “100% impenetrable”: documentar controles, riesgos residuales, RPO/RTO y respuesta ante incidentes.

## 12. Fuentes primarias para la implementación

- Matrix E2EE: https://matrix.org/docs/matrix-concepts/end-to-end-encryption/
- Synapse security: https://element-hq.github.io/synapse/latest/setup/security.html
- Synapse Admin API: https://element-hq.github.io/synapse/latest/usage/administration/admin_api/
- Synapse configuration/federation/retention: https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html
- Synapse backups: https://element-hq.github.io/synapse/latest/usage/administration/backups.html
- Elastic security: https://www.elastic.co/guide/en/elasticsearch/reference/current/security-getting-started.html/
- Elastic network policies: https://www.elastic.co/docs/deploy-manage/security/network-security-policies
- Elastic DLS/FLS limitations: https://www.elastic.co/guide/en/elasticsearch/reference/current/security-limitations.html
- Elastic audit logging: https://www.elastic.co/guide/en/elasticsearch/reference/current/enable-audit-logging.html
- Elastic snapshots: https://www.elastic.co/guide/en/elasticsearch/reference/current/snapshots-take-snapshot.html/
- Supabase Realtime limits: https://supabase.com/docs/guides/realtime/limits
- Supabase Broadcast vs Postgres Changes: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase compute and disk: https://supabase.com/docs/guides/platform/compute-and-disk
- LiveKit self-hosting: https://docs.livekit.io/transport/self-hosting/

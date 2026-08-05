# Tarea maestra para Claude Code — Chat de equipo completo

Lee antes de actuar:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/ONYXLINK-ARQUITECTURA-CHAT-BIBLIOTECA-SEGURIDAD.md`
4. `docs/ONYXLINK-PROTOCOLO-CIERRE.md`

La arquitectura es vinculante. No improvises una segunda arquitectura, no reutilices las tablas de WhatsApp y no implementes todas las fases en un único commit.

## Resultado final

OnyxLink tendrá:

- Chat interno instantáneo por workspace.
- Canal General y mensajes directos.
- Límites de miembros por plan controlados por OnyxLink.
- Documentos privados y seguros dentro del Chat.
- Videollamadas internas embebidas en el panel.
- Biblioteca visual inferior en Proyectos y Contenido.
- Métricas de capacidad, aislamiento multiempresa y hardening.

## Fase 1 — cimientos, plazas y mensajería instantánea

Implementa ahora únicamente esta fase.

### Base de datos y contratos

- Añade `team_chat_enabled` y `human_member_limit` a `workspaces`.
- Valores sugeridos al provisionar: Gestión 1, WhatsApp 2, Suite 4; el límite efectivo debe poder editarlo el superadministrador.
- Los superadministradores OnyxLink no consumen plaza.
- Crea enforcement transaccional de última plaza para invitación y reactivación.
- Endurece la lectura de `users`: propio usuario, usuarios con workspace activo compartido o superadministrador.
- Crea `team_channels`, `team_channel_members` y `team_messages` según la arquitectura.
- Constraints/trigger deben impedir cualquier relación cruzada de workspace.
- RLS completa con membership activa y participación real.
- Crear un General único por workspace al activar/provisionar Chat.
- Crear DM canónico único por pareja dentro del workspace.

### Realtime

- Usa Supabase Broadcast privado y autorización Realtime; no publiques archivos ni cuerpos grandes.
- Una conexión por sesión y suscripción solo a conversaciones activas.
- Persistir primero el mensaje y emitir después el evento.
- Reconectar y reconciliar desde base de datos para no perder mensajes.

### API y dominio

- Guards server-side en todas las operaciones.
- Validación Zod, texto plano, longitud máxima, rate limit y paginación por cursor.
- Borrado lógico; no permitir DELETE físico desde cliente.
- Errores estables, incluido `TEAM_SEAT_LIMIT_REACHED`.
- Offboarding corta lectura, escritura y Realtime de inmediato.

### UX

- Entrada “Chat de equipo” condicionada por `team_chat_enabled`.
- Escritorio: conversaciones, chat y detalle compacto.
- Móvil: lista y conversación como pantallas separadas, compositor respetando `safe-area`.
- General, DM, no leídos, carga histórica, enviar, reconectar, vacío, error y mensaje eliminado.
- Ajustes → Negocio: toggle y límite solo para superadministrador.
- Ajustes → Equipo, Mi equipo y `/workspaces`: plazas ocupadas/contratadas.

### Pruebas obligatorias

- JWT reales de Empresa A y B.
- A no enumera perfiles, canales, mensajes ni contadores de B.
- Manipular workspace/canal devuelve 403 o cero filas.
- Dos invitaciones concurrentes no superan la última plaza.
- Superadmin no consume plaza.
- Desactivación corta acceso inmediatamente.
- Realtime privado no filtra eventos de otro workspace.
- Escritorio y móvil sin errores de consola.
- Typecheck, lint, suite completa, build y `git diff --check`.

### Entrega Fase 1

Detente al terminar. Entrega informe técnico, migración, pruebas, capturas y riesgos. No empieces documentos ni vídeo hasta recibir la orden de continuar.

## Fase 2 — documentos privados

No iniciar hasta cerrar Fase 1.

- Bucket privado `team-chat-files`.
- Tabla de adjuntos y rutas con workspace/canal/mensaje/UUID.
- RLS de tabla y Storage.
- 10 MB iniciales por archivo y cuota configurable por workspace.
- Allowlist de PDF, Office e imágenes seguras.
- Bloqueo de ejecutables, HTML y SVG activo.
- Cuarentena y escaneo antimalware antes de descargar.
- Hash, MIME real, tamaño, uploader y auditoría.
- Descarga autenticada o URL firmada muy corta.
- TUS para archivos mayores de 6 MB.
- Pruebas A/B, cuota, archivo malicioso, MIME falso y offboarding.
- Auditoría visual escritorio/móvil.

Detenerse y entregar informe antes de Fase 3.

## Fase 3 — videollamada interna

No iniciar hasta cerrar Fase 2 y aprobar la prueba de capacidad.

- Crear prueba de concepto LiveKit separada de Supabase y Vercel.
- Integrar el cliente visualmente dentro del Chat.
- Botón Llamar en General y DM.
- Backend emite JWT corto tras verificar workspace, canal, membership, plan y cupo.
- Salas opacas; nunca nombres predecibles.
- Sin grabación, transcripción ni IA inicialmente.
- E2EE cuando el flujo seleccionado lo soporte.
- Expulsión/offboarding y prevención de reentrada.
- TURN y fallback de redes corporativas.
- Límites por participantes, minutos y llamadas simultáneas.
- Métricas, costes y load test documentados.
- Para clientes críticos, infraestructura/medios dedicados.

Detenerse y entregar informe antes de Fase 4.

## Fase 4 — biblioteca visual y cierre global

- Extraer catálogos únicos de vistas de Proyectos y Contenido.
- Crear `ModuleLibrary` compartida.
- Mantener pestañas superiores.
- Añadir biblioteca inferior/dock compacto que actualice el mismo `?view=`.
- Proyectos: Proyectos, Tareas, Agenda, Board, Anotaciones y Oportunidades.
- Contenido: Pipeline, Ideas y Guiones.
- Respetar flags, deep links, historial, accesibilidad, móvil y `safe-area`.
- Auditoría visual completa del Chat, equipo, ajustes, Proyectos y Contenido.

## Fase 5 — capacidad, seguridad y preparación empresarial

- Dashboard/alertas para Realtime, eventos/s, conexiones, CPU, RAM, Postgres, IOPS, Storage, egress y vídeo.
- Umbrales 60/75/90 %.
- Retención y cuotas por contrato.
- Logger por allowlist: prohibido registrar mensajes, documentos, audio, tokens, cookies, secretos o URLs firmadas.
- Threat model actualizado y runbooks de incidente/offboarding/rotación.
- Backups y restauración ensayados.
- Pentest externo antes de clientes de alta criticidad.
- Decidir con métricas si ampliar compute, disco/IOPS o separar proyectos por cliente/tier.

## Matrix y ELK

No desplegar Matrix ni ELK dentro de estas fases sin una orden independiente.

- Matrix/Synapse queda como edición futura para clientes que necesiten infraestructura de mensajería dedicada.
- ELK/Elastic queda como proyecto separado de observabilidad, con ingesta minimizada y red privada.
- Ninguno debe bloquear la entrega del Chat nativo.

## Reglas de publicación

- Un commit claro por fase.
- Nunca incluir `.env`, `.next`, `.vercel`, backups, temporales ni scripts protegidos.
- No aplicar migraciones remotas ni desplegar hasta autorización expresa al cerrar cada fase.
- Mantener siempre una versión estable recuperable.

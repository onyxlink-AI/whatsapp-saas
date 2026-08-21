# Continuidad del proyecto Dirección de OnyxLink

**Propietario:** Dirección de OnyxLink

**Última actualización:** 21/08/2026

**Repositorio:** `onyxlink-AI/whatsapp-saas`

**Acceso funcional:** exclusivamente `internal_admin` y `super_admin`; nunca clientes

## 1. Propósito y uso en conversaciones nuevas

Este documento es la memoria operativa del proyecto Dirección. Una conversación
nueva de Codex o Claude Code debe leer, por este orden:

1. `AGENTS.md` y `CLAUDE.md`;
2. `docs/ONYXLINK-RUNBOOK-RECUPERACION.md`;
3. `docs/ONYXLINK-PROTOCOLO-CIERRE.md`;
4. este documento;
5. `docs/ONYXLINK-PUBLICACION-TEMPORAL-SIN-R2.md` mientras siga activo.

No reconstruir el alcance desde conversaciones antiguas ni empezar de cero. La
fuente de verdad es el código de `origin/main` y este documento.

## 2. Estado publicado a 20/08/2026

La publicación se preparó desde el SHA exacto
`c058318f68b0b222ea9374cf3640354ccfde34ab` y el deployment de Vercel
`dpl_FptyDQBuehvxXMQBLnbpFBiZUiHf`.

Se aplicaron y quedaron sincronizadas en Supabase Production
`uyrrunmqzdisplbdtabi` estas migraciones:

- `20260817140000_platform_role_staff_separation.sql`;
- `20260818094500_agency_goals.sql`;
- `20260818120000_agency_kpis.sql`.

La comprobación inicial de producción fue correcta: `/login` 200,
`/dashboard` sin sesión 307, configurador sin sesión 401, rutas internas sin
sesión 307 y ningún 5xx. Antes de considerar cerrada esta versión, conservar en
el informe de entrega el resultado de la observación de 15 minutos y del smoke
test autenticado.

### 2.1 Separación de acceso interno

- `platform_role` distingue `internal_admin`, `super_admin` y clientes.
- Existe compatibilidad con superadministradores históricos que conservan
  `is_super_admin=true`.
- Las rutas de Dirección y sus datos son internas.
- Todo módulo nuevo de Dirección debe aplicar la misma protección de servidor,
  privilegios PostgreSQL, RLS y pruebas negativas de aislamiento.

### 2.2 Objetivos — completado

Ruta: `/direccion/objetivos`.

Incluye exactamente objetivos:

- anuales;
- trimestrales;
- mensuales;
- semanales.

Los periodos canónicos, responsables internos, autoría y fechas están
protegidos tanto en aplicación como en PostgreSQL.

### 2.3 KPI — completado

Ruta: `/direccion/kpi`.

Incluye exactamente cuatro KPI, ni uno más ni uno menos:

1. clientes activos;
2. retención media;
3. ticket medio;
4. porcentaje de cierre de reuniones de ventas.

Los datos proceden de relaciones de clientes y reuniones introducidas por el
equipo. Las relaciones conservan el nombre histórico si se elimina el
workspace. Los estados sin datos no inventan porcentajes ni importes.

### 2.4 Operaciones — implementado y validado localmente, pendiente de publicación

Estado exacto a 21/08/2026: **TAREA 4A/4A.1 y TAREA 4B están implementadas y
validadas localmente en `feature/direccion-operaciones`.** La validación
final local ya está terminada:

- 1543/1543 pruebas en verde (`npm run test:ci`, suite serializada), más
  `typecheck`, `lint` y `build` correctos.
- Comprobación visual en escritorio (~1440×900) y en móvil (~390×844):
  cuadrícula, crear/editar/eliminar bloques, formulario y navegación por
  pestañas de día.
- Roles verificados: acceso concedido a `internal_admin` y `super_admin`;
  bloqueo confirmado para clientes, incluidos administradores de workspace
  (sin tarjeta Operaciones y sin acceso directo a `/direccion/operaciones`).

El cambio tiene un commit local en `feature/direccion-operaciones`. **Sigue
pendiente la publicación y la verificación posterior en producción —
Operaciones todavía no está publicada.** No forma parte de la publicación de
Objetivos/KPI del 20/08/2026 (sección 2, arriba) — esa publicación no
incluyó ninguna migración ni código de Operaciones.

Ruta prevista una vez publicado: `/direccion/operaciones`.

Aclaración funcional vinculante del propietario: `agency_schedule_blocks` es
el horario semanal interno de OnyxLink, exclusivamente para que el
propietario y su socio indiquen a qué hora se conectan y qué trabajo tienen
previsto. Es una plantilla recurrente de lunes a domingo, una celda por
hora, sin `workspace_id`. El contenido de cada celda es texto libre — aunque
describa una tarea o actividad, es únicamente ese texto dentro de esta
tabla. Nunca crea, actualiza ni se convierte en una fila de `public.tasks`
ni de `public.agenda_tasks`, no aparece en Gestión y no se sincroniza con
Google Calendar. Las tareas y el calendario que se venden a los clientes son
otro producto y otro flujo, completamente separados de este horario interno,
y este horario nunca reutiliza esa interfaz ni se muestra a clientes.

- **TAREA 4A/4A.1** — modelo de datos, RLS, triggers y Server Actions.
  Implementado y validado localmente, con commit local; sin publicar.
- **TAREA 4B** — interfaz: cuadrícula semanal, formulario y tarjeta de
  Dirección. Implementado y validado localmente (funcional y visualmente),
  con commit local; sin publicar. Pendiente: publicación y verificación
  posterior en producción.

La futura TAREA 5 (tareas semanales) no debe presentarse ni construirse como
una extensión de este horario interno: es una ampliación aparte del módulo
de tareas ya existente (ver 3.1).

## 3. Alcance pendiente

### 3.1 Tareas semanales — pendiente (TAREA 5)

El horario semanal interno de Operaciones ya está implementado y validado
localmente, pendiente de publicación (ver 2.4), y permanece deliberadamente
separado de esta tarea pendiente. Lo que queda es
una extensión del módulo de tareas ya existente para tareas semanales — no
del horario interno de Operaciones, no de `agency_schedule_blocks`. No crear
un sistema nuevo de tareas diarias: el requisito explícito fue añadir solo
tareas semanales.

### 3.2 Marketing — calendario interno de contenidos

Adaptar el apartado de contenidos ya existente:

- calendario propio de OnyxLink, sin Google Calendar ni sincronización externa;
- colocar en fechas los contenidos que ya existen en ideas, pipeline o guiones;
- no duplicar el contenido: el calendario referencia el elemento existente;
- permitir moverlo de fecha y reconocer visualmente su estado.

Debe vivir en Marketing, no duplicarse dentro de Dirección.

### 3.3 Adquisición comercial — procedencia del lead

Añadir al pipeline de ventas una procedencia con estas opciones exactas:

- email marketing;
- outbound de Instagram;
- recomendado por embajadores;
- flyer;
- llamada en frío;
- colaboración.

Reutilizar la entidad de oportunidad/lead existente y mostrar el dato en el
pipeline y donde resulte útil en CRM. No crear un segundo CRM.

### 3.4 Comercial

Crear dentro de la zona interna:

1. una tabla muy básica para propuestas, con concepto incluido y precio, capaz
   de exportarse ya compuesta en un formato sencillo;
2. un catálogo interno de precios, mediante editor limitado y cuadrícula
   sencilla, solo para consulta y mantenimiento del equipo.

Antes de crear nuevas entidades, auditar oportunidades, productos, propuestas
y proyectos existentes para reutilizar lo que ya encaje.

### 3.5 Onboarding de clientes

Asociar una lista de comprobación a cada cliente del CRM. Checks exactos:

1. contrato enviado;
2. pago recibido;
3. bienvenida y documentos de funcionamiento entregados;
4. acceso y contraseña entregados;
5. llamada de alineación realizada;
6. plan de acción entregado para reducir arrepentimiento y aclarar los pasos.

Debe conservar progreso, fecha y actor interno de cada check. Un cliente no
puede leer ni modificar este módulo interno.

### 3.6 Reuniones y transcripción

Crear un apartado que permita iniciar una captura autorizada, transcribir la
reunión y guardar el texto para análisis posterior.

Antes de implementar, realizar una fase técnica y legal específica:

- consentimiento y aviso visible de grabación/transcripción;
- permisos de micrófono mediante `getUserMedia`;
- captura de pestaña/pantalla y audio mediante `getDisplayMedia` cuando el
  navegador lo permita;
- límites reales de audio del sistema en móviles, navegadores y sistemas
  operativos;
- retención, cifrado, acceso, borrado y tamaño de los audios/transcripciones;
- proveedor y coste de transcripción;
- prohibición de prometer captura universal de “todo el sonido del dispositivo”
  si la plataforma no lo permite.

No construir grabación oculta ni intentar eludir permisos del dispositivo.

## 4. Arquitectura de información

Regla general: adaptar primero lo que ya exista.

| Necesidad | Ubicación preferida |
|---|---|
| Objetivos y KPI | Dirección |
| Horario y operación interna | Dirección → Operaciones |
| Propuestas y catálogo interno | Dirección → Comercial |
| Checklist vinculado al CRM | Dirección → Onboarding de clientes |
| Transcripción interna | Dirección → Reuniones |
| Calendario de contenidos | Marketing → Contenidos |
| Procedencia del lead | Pipeline de ventas / CRM existente |
| Tareas semanales | Módulo de tareas existente, independiente del horario interno de Operaciones |

No crear un módulo paralelo si oportunidad, proyecto, tarea, contenido o CRM ya
resuelven la entidad principal.

## 5. Orden recomendado de ejecución

Cada tarea debe cerrarse, probarse y auditarse antes de comenzar la siguiente.

1. **TAREA 4 — Auditoría de Operaciones:** modelo existente, UX, RLS y plan. Completada.
2. **TAREA 4A/4A.1/4B — Horario semanal interno:** base de datos, RLS, acciones e interfaz. Implementado y validado localmente en `feature/direccion-operaciones`, con commit local; pendiente de publicación y verificación en producción (ver 2.4).
3. **TAREA 5 — Tareas semanales:** extensión del módulo de tareas existente, separada del horario interno de Operaciones.
4. **TAREA 6 — Calendario interno de contenidos.**
5. **TAREA 7 — Procedencia del lead en pipeline/CRM.**
6. **TAREA 8 — Propuestas simples y catálogo interno de precios.**
7. **TAREA 9 — Onboarding de clientes enlazado al CRM.**
8. **TAREA 10 — Descubrimiento y prototipo seguro de transcripción.**

La primera conversación nueva debe empezar por la auditoría de TAREA 4, no por
implementar directamente la cuadrícula.

## 6. Criterios permanentes de aceptación

- Acceso exclusivo de personal interno en servidor y base de datos.
- Ninguna confianza en ocultar enlaces solo desde la interfaz.
- RLS real y privilegios mínimos para cada tabla.
- Pruebas negativas de cliente, `internal_admin`, `super_admin` y legado cuando
  corresponda.
- Fechas y periodos validados también en PostgreSQL.
- Reutilización de módulos existentes antes de crear otros.
- Supabase local para pruebas; nunca producción durante desarrollo.
- Migración versionada y aditiva.
- Staging y smoke test autenticado antes de producción.
- Publicación conforme al protocolo vigente y autorización literal.

## 7. Texto para abrir la próxima conversación

Usar este mensaje:

> Continuamos el proyecto Dirección de OnyxLink. Lee AGENTS.md, CLAUDE.md,
> ONYXLINK-RUNBOOK-RECUPERACION.md, ONYXLINK-PROTOCOLO-CIERRE.md,
> ONYXLINK-DIRECCION-CONTINUIDAD.md y el protocolo temporal de publicación si
> sigue activo. Objetivos y KPI ya están publicados. Empieza por la auditoría
> de TAREA 4 — Operaciones. No implementes ni toques producción todavía.

## 8. Conversación reservada para backup

La conversación que originó este documento queda reservada exclusivamente para:

- recibir la respuesta de Supabase Support sobre el `401 Unauthorized` del
  endpoint de backups;
- completar el primer snapshot real cifrado en R2;
- verificar el marcador `COMPLETED` y preparar un restore kit;
- decidir cuándo retirar el procedimiento temporal de publicación.

El desarrollo restante de Dirección debe continuar en una conversación nueva.

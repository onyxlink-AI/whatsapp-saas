# Continuidad del proyecto Dirección de OnyxLink

**Propietario:** Dirección de OnyxLink

**Última actualización:** 21/08/2026 (publicación de Operaciones en producción)

**Repositorio:** `onyxlink-AI/whatsapp-saas`

**Acceso funcional:** exclusivamente `internal_admin` y `super_admin`; nunca clientes

## 1. Propósito y uso en conversaciones nuevas

Este documento es la memoria operativa del proyecto Dirección. Una conversación
nueva de Codex o Claude Code debe leer, por este orden:

1. `AGENTS.md` y `CLAUDE.md`;
2. `docs/ONYXLINK-RUNBOOK-RECUPERACION.md`;
3. `docs/ONYXLINK-PROTOCOLO-CIERRE.md`;
4. este documento.

`docs/ONYXLINK-PUBLICACION-TEMPORAL-SIN-R2.md` queda retirado y marcado como
histórico desde el 21/08/2026: ya no forma parte de la lectura obligatoria.

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

### 2.4 Operaciones — completado y publicado en producción (21/08/2026)

**Estado: publicado, verificado y en uso en producción.** Ruta:
`/direccion/operaciones`.

- **TAREA 4A/4A.1** — modelo de datos, RLS, triggers y Server Actions.
  Completado y publicado.
- **TAREA 4B** — interfaz: cuadrícula semanal, formulario y tarjeta de
  Dirección. Completado y publicado.
- **TAREA 4 en su conjunto: completada.**

#### Publicación oficial

- PR de Operaciones: [#17](https://github.com/onyxlink-AI/whatsapp-saas/pull/17)
  (rama `feature/direccion-operaciones`), fusionada mediante merge commit
  `1fc0f91ed2349b193d8037c13ee99b8e8a3f44c4`.
- PR de corrección del workflow de producción:
  [#18](https://github.com/onyxlink-AI/whatsapp-saas/pull/18), fusionada
  mediante merge commit `cffb80c2be94ff0754670c0f262684dec38e0351` — este es
  el SHA final de `origin/main` publicado.
- Workflow de producción exitoso: run `32507838815` ("Publicar producción con
  aprobación"), disparado con `sha=cffb80c2be94ff0754670c0f262684dec38e0351` y
  `confirmation=PUBLICAR`, aprobado manualmente en el Environment `production`.
- CI del `main` publicado: run `32507215784`, verde.
- Migración aplicada y sincronizada en Supabase Production
  `uyrrunmqzdisplbdtabi`: `20260820140000_agency_schedule_blocks.sql` — única
  migración nueva, puramente aditiva.
- Deployment de Vercel Production:
  `https://whatsapp-saas-598mfj955-onyxlink.vercel.app`, servido en
  `https://onyxlinkpanel.com`.

#### Evidencia de validación

- **Staging:** candidato `df72f4639f0c985d6f77b1ba241f9d395c0a257d` desplegado
  y probado con cuentas ficticias creadas específicamente para el smoke
  (`super_admin`, `internal_admin` y un workspace/cliente ficticios,
  exclusivos de `onyxlink-staging`, nunca copiados de producción). Roles,
  CRUD completo, aislamiento cliente/interno, escritorio y móvil verificados
  individualmente para las tres cuentas.
- **Producción:** smoke autenticado con `super_admin` real verificado
  explícitamente (Dirección, Operaciones, cuadrícula, CRUD completo con
  bloque temporal creado y eliminado sin dejar rastro). Escritorio, móvil y
  consola sin errores. Gestión, tareas de clientes, `public.tasks`,
  `public.agenda_tasks` y Google Calendar confirmados intactos. Observación
  de producción durante 15 minutos reales sin incidencias.
- **Salvedad exacta:** para `internal_admin` y para la cuenta cliente de
  aislamiento, la confirmación final en producción fue positiva en conjunto,
  pero no quedó registrada por separado como evidencia individual (a
  diferencia de staging, donde sí se verificaron uno a uno). No debe darse
  por hecha una verificación individual de producción para esas dos cuentas
  que no ocurrió explícitamente.

#### Historial de bloqueos de publicación y su resolución

La primera publicación (TAREA 4D) se detuvo dos veces antes de tocar
producción, exactamente como exige el protocolo ante cualquier fallo previo a
la migración:

1. El Environment `production` de GitHub no tenía ningún secret configurado
   (ni a nivel de repositorio), así que `PRODUCTION_ENCRYPTION_KEY_VERSION`
   se resolvía como cadena vacía. `crypto.ts` usa
   `process.env.ENCRYPTION_KEY_VERSION ?? "v1"`, y `??` no sustituye una
   cadena vacía — solo `null`/`undefined` — así que el candidato quedó
   marcado con una versión vacía y `decryptCredentials` no reconoció el
   cifrado propio. Se reconstruyeron manualmente los 11 secrets del
   Environment `production` desde Bitwarden (nunca generados ni rotados).
2. Corregido eso, el siguiente intento falló en "Comprobar backups físicos":
   `production.yml` ejecutaba `supabase backups list` sin `--output json`,
   así que `jq` no podía interpretar la tabla de texto devuelta. Se corrigió
   reutilizando el mismo patrón ya operativo de `backup-production.yml`
   (PR #18).
3. La tercera ejecución del workflow de producción completó los 21 pasos en
   verde: validación, backup físico, preflight remoto, enlace a Supabase
   Production, migración, sincronización, despliegue en Vercel y smoke
   público.

En ningún momento de estos dos bloqueos se tocó Supabase Production ni se
desplegó nada — ambos fallaron antes de la migración, tal como exige el
protocolo.

#### Resumen operativo del flujo de publicación (vía oficial probada)

1. Staging del SHA candidato exacto (`workflow_dispatch` de `staging.yml`).
2. CI en verde para el candidato.
3. Backup físico recuperable confirmado (`COMPLETED`, checksum verificado).
4. Merge a `main` mediante merge commit (nunca squash ni rebase).
5. CI verde del nuevo HEAD de `main`.
6. Ejecución manual única de `production.yml` con el SHA exacto del HEAD y
   `confirmation=PUBLICAR` — nunca se dispara automáticamente al fusionar.
7. Aprobación humana del Environment `production` (required reviewer, nunca
   vía API).
8. Validación, migraciones versionadas, despliegue en Vercel y smoke público
   dentro del propio workflow.
9. Smoke autenticado y observación mínima de 15 minutos tras el éxito.

Ante cualquier fallo antes de la migración, el procedimiento se detiene sin
reintentar automáticamente y sin diagnosticar a ciegas.

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

La futura TAREA 5 (tareas semanales) no debe presentarse ni construirse como
una extensión de este horario interno: es una ampliación aparte del módulo
de tareas ya existente (ver 3.1).

## 3. Alcance pendiente

### 3.1 Tareas semanales — pendiente (TAREA 5)

El horario semanal interno de Operaciones ya está implementado, validado y
publicado en producción (ver 2.4), y permanece deliberadamente separado de
esta tarea pendiente. Lo que queda es
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
2. **TAREA 4A/4A.1/4B — Horario semanal interno:** base de datos, RLS, acciones e interfaz. Completado y publicado en producción el 21/08/2026 (ver 2.4).
3. **TAREA 5 — Tareas semanales:** extensión del módulo de tareas existente, separada del horario interno de Operaciones. Próxima tarea a auditar.
4. **TAREA 6 — Calendario interno de contenidos.**
5. **TAREA 7 — Procedencia del lead en pipeline/CRM.**
6. **TAREA 8 — Propuestas simples y catálogo interno de precios.**
7. **TAREA 9 — Onboarding de clientes enlazado al CRM.**
8. **TAREA 10 — Descubrimiento y prototipo seguro de transcripción.**

La primera conversación nueva debe empezar por la auditoría de TAREA 5, no por
reabrir TAREA 4 — Operaciones, que ya está completa y publicada.

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
> ONYXLINK-RUNBOOK-RECUPERACION.md, ONYXLINK-PROTOCOLO-CIERRE.md y
> ONYXLINK-DIRECCION-CONTINUIDAD.md. Objetivos, KPI y Operaciones ya están
> publicados. Empieza por la auditoría de TAREA 5 — Tareas semanales. No
> implementes ni toques producción todavía.

## 8. Conversación reservada para backup — cerrada el 21/08/2026

La conversación que originó este documento quedó reservada exclusivamente
para: recibir la respuesta de Supabase Support sobre el `401 Unauthorized`
del endpoint de backups, completar el primer snapshot real cifrado en R2,
verificar el marcador `COMPLETED` y decidir cuándo retirar el procedimiento
temporal de publicación. Los tres primeros puntos se completaron el
21/08/2026 (run `32463038193`, snapshot `daily/20260821T082502Z`,
`COMPLETED`, checksum verificado) y el procedimiento temporal de publicación
quedó retirado ese mismo día (ver
`docs/ONYXLINK-PUBLICACION-TEMPORAL-SIN-R2.md`). Esta reserva queda cerrada.

El desarrollo restante de Dirección continúa en conversaciones nuevas.

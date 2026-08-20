# Continuidad del proyecto Dirección de OnyxLink

**Propietario:** Dirección de OnyxLink

**Última actualización:** 20/08/2026

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

## 3. Alcance pendiente

### 3.1 Operaciones — siguiente bloque recomendado

Debe incluir:

- horario interno semanal de lunes a domingo;
- cuadrícula por horas, de una hora en una hora;
- selección de bloques que queden marcados por color;
- texto libre dentro de cada bloque;
- asignación opcional de personas o responsables internos existentes;
- edición y eliminación sencillas;
- tareas semanales integradas en el apartado de tareas ya existente.

No crear un sistema nuevo de tareas diarias: el requisito explícito fue añadir
solo tareas semanales.

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
| Tareas semanales | Módulo de tareas existente, visible desde Operaciones si procede |

No crear un módulo paralelo si oportunidad, proyecto, tarea, contenido o CRM ya
resuelven la entidad principal.

## 5. Orden recomendado de ejecución

Cada tarea debe cerrarse, probarse y auditarse antes de comenzar la siguiente.

1. **TAREA 4 — Auditoría de Operaciones:** modelo existente, UX, RLS y plan.
2. **TAREA 4B — Horario semanal interno:** base de datos, acciones y cuadrícula.
3. **TAREA 5 — Tareas semanales:** extensión del módulo de tareas existente.
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

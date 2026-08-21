# OnyxLink — Runbook vivo de incidencias de Supabase

**Estado:** operativo y versionado

**Última actualización:** 21 de agosto de 2026

**Ámbito:** Auth, API Gateway, PostgREST/RLS, PostgreSQL, Storage, Realtime,
Dashboard, CLI, Management API y backups

**Propietario:** OnyxLink

## 1. Objetivo

Este documento convierte errores observados en la comunidad de Supabase y en
OnyxLink en procedimientos repetibles. Su finalidad es diagnosticar más rápido,
evitar cambios impulsivos en producción y conservar las soluciones confirmadas
para futuras conversaciones y agentes.

No pretende copiar todo Discord. Discord es una señal comunitaria dinámica y
puede contener respuestas incompletas, antiguas o peligrosas. Solo se incorpora
un caso cuando tiene un síntoma reproducible y puede contrastarse con una de
estas fuentes:

1. estado o documentación oficial de Supabase;
2. logs y pruebas propias de OnyxLink;
3. respuesta técnica de personal/moderadores de Supabase;
4. varios casos comunitarios coincidentes, marcados como no confirmados.

Nunca se guardan aquí tokens, contraseñas, claves, DSN completos, cookies,
datos personales ni referencias que no sean necesarias.

## 2. Niveles de evidencia

| Nivel | Evidencia | Uso permitido |
|---|---|---|
| A | Estado/documentación oficial o reproducción propia concluyente | Puede sustentar una acción siguiendo este runbook |
| B | Respuesta de personal/moderador de Supabase o varios casos coherentes | Hipótesis prioritaria; confirmar con logs antes de actuar |
| C | Mensaje aislado de comunidad/Discord | Pista únicamente; no autoriza cambios |

Una solución de nivel C nunca justifica por sí sola ejecutar SQL, modificar RLS,
rotar credenciales, reiniciar el proyecto o desplegar.

## 3. Protocolo de los primeros cinco minutos

1. **Congelar acciones repetitivas.** No reintentar workflows, rotar tokens ni
   cambiar políticas hasta saber qué capa falla.
2. **Registrar evidencia mínima:** fecha/hora y zona horaria, URL o función,
   código HTTP, texto exacto, usuario/rol afectado, request ID si existe y último
   cambio publicado. Redactar cualquier secreto.
3. **Comprobar el estado oficial:**
   [Supabase Status](https://status.supabase.com/) y, si se automatiza,
   [resumen JSON](https://status.supabase.com/api/v2/summary.json).
4. **Delimitar alcance:** una persona, un workspace, un navegador, producción
   completa o también staging/local.
5. **Identificar la capa antes de corregir:**

   | Señal | Capa probable |
   |---|---|
   | `Invalid Refresh Token`, JWT rechazado | Auth, cookies o API Gateway |
   | `new row violates row-level security` | RLS/rol/claims |
   | `permission denied for table/schema` | GRANT/privilegios, no necesariamente RLS |
   | `SASL`, `SCRAM`, `connection refused` | contraseña, URI, red o bloqueo temporal |
   | timeout, 520, demasiadas conexiones | recursos, consultas o pooler |
   | 403 de Storage | política de `storage.objects`, bucket o ruta |
   | Realtime `CLOSED`, `TIMED_OUT`, sin eventos | canal, JWT, política o conectividad |
   | 401 en `supabase backups list` | Management API/PAT/permisos |
   | Dashboard no carga pero la app sí | Dashboard/cuenta/navegador, no base de datos |

6. **Aplicar una sola comprobación reversible.** Comparar resultado antes y
   después. No mezclar varios cambios en un mismo intento.
7. **Parar y escalar** si hay posible pérdida de datos, fallo global, duda sobre
   `auth.*`, divergencia de migraciones o dos intentos idénticos sin nueva
   evidencia.

## 4. Severidad y respuesta

| Nivel | Criterio | Respuesta |
|---|---|---|
| P0 | pérdida/corrupción de datos, acceso indebido o caída total | congelar cambios, preservar logs, rollback seguro y soporte inmediato |
| P1 | login o función esencial falla para muchos usuarios | detener despliegues, comprobar estado, mitigar y escalar |
| P2 | función parcial o un workspace afectado | diagnosticar con pruebas acotadas; corrección versionada |
| P3 | Dashboard/CLI local o caso aislado sin impacto cliente | resolver en horario normal sin tocar producción |

## 5. Matriz rápida de errores y acciones

| Síntoma | Causas frecuentes | Primera acción segura | No hacer |
|---|---|---|---|
| 401 `Invalid Refresh Token` | cookie/token antiguo, sesión revocada, desajuste SSR, incidencia JWT | probar sesión nueva/incógnito, revisar Auth y API Gateway, estado oficial | rotar claves globales o borrar usuarios |
| 401 en Management API/backups | PAT inválido/caducado, cuenta u organización incorrecta o permiso `backups_read` ausente | probar una única llamada de lectura con el PAT sin mostrarlo y confirmar su último uso/caducidad | repetir el workflow indefinidamente |
| 401 al escribir en Cloudflare R2 | endpoint con ruta de bucket o pareja Access Key ID/Secret Access Key incorrecta | usar el endpoint de cuenta sin bucket y dos credenciales del mismo token R2, limitado al bucket | usar `Token value` como clave S3 o rotar credenciales no relacionadas |
| 501 seguido de `immutable file modified` en R2 | cliente S3/rclone antiguo completa el upload pero falla en una operación posterior compatible solo parcialmente | comprobar la versión real del runner y usar una versión moderna fijada por checksum | reintentar sobre una ruta inmutable ya parcialmente escrita |
| 403 `new row violates row-level security` | `auth.uid()` no coincide, rol equivocado, `WITH CHECK` ausente, ruta incorrecta | inspeccionar rol/claims y política exacta; reproducir con sesión real | desactivar RLS en producción |
| `permission denied for table/schema` | falta `GRANT`, esquema no expuesto, ownership | revisar grants y rol efectivo | asumir que siempre es RLS |
| Auth 500 / `Database error querying schema` | trigger, constraint, NULL manual, permisos/ownership de `auth.*` | revisar Auth y Postgres logs con timestamp/request ID | editar o borrar filas de `auth.users` a ciegas |
| CLI SASL/SCRAM | contraseña incorrecta, caracteres sin percent-encoding, IP bloqueada | comprobar contraseña/URI y Network Bans; esperar/desbloquear | regenerar todo el proyecto |
| `connection refused` | IP bloqueada tras intentos, host/puerto o IPv4/IPv6 incorrecto | comprobar host/pooler y Network Bans | insistir con contraseña dudosa |
| timeout/520/too many clients | CPU/RAM/IO, consulta lenta, conexiones sin pooler | Health/Reports, consultas, conexiones y pooler | reiniciar como solución permanente |
| Storage 403 | política INSERT/SELECT, bucket/ruta/extensión no coincidente | revisar `storage.objects` y nombre real del objeto | hacer público el bucket como arreglo |
| Dashboard no carga/proyecto no aparece | caché/cookies, cuenta u organización equivocada, incidencia Dashboard | incógnito/otro navegador, verificar organización y estado de la app | restaurar o migrar la base por esto |
| Realtime sin eventos | suscripción no confirmada, tema duplicado, RLS/JWT, canal privado | registrar estado de `subscribe`, Inspector/logs y JWT | convertir canales privados en públicos |
| Presence rate limit | más de 5 actualizaciones/30 s por cliente | limitar frecuencia o usar Broadcast | subir frecuencia de reintentos |

## 6. Procedimientos por categoría

### 6.1 Auth, JWT y sesiones

**Diagnóstico seguro**

1. Confirmar si falla una sesión antigua o también un login nuevo en incógnito.
2. Revisar Auth Logs y API Gateway en el intervalo exacto.
3. Comparar `sub`, rol, expiración y proyecto esperado sin copiar el JWT.
4. En SSR, confirmar que cookies y refresco de sesión siguen el flujo oficial.
5. Si hay una incidencia oficial de JWT, congelar cambios de autenticación y
   observar el despliegue del proveedor.

Un `Invalid Refresh Token` aislado con respuestas HTTP controladas puede ser una
cookie caducada correctamente rechazada; no equivale por sí solo a una caída.

**Auth 500**

Los triggers sobre `auth.users`, constraints, funciones sin privilegios
adecuados y modificaciones manuales del esquema Auth pueden romper altas o
login. Capturar primero el error exacto de Auth/Postgres. Cualquier corrección
de ownership o esquema debe ser una migración revisada o una instrucción de
soporte; nunca SQL improvisado desde Discord.

Fuentes oficiales:

- [Guía avanzada de Auth SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Resolver errores 500 de Auth](https://supabase.com/docs/guides/troubleshooting/resolving-500-status-authentication-errors-7bU5U8)
- [Database error querying schema](https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44)
- [Errores al gestionar usuarios](https://supabase.com/docs/guides/troubleshooting/dashboard-errors-when-managing-users-N1ls4A)

### 6.2 RLS frente a privilegios SQL

`RLS` y `GRANT` son barreras diferentes:

- `new row violates row-level security` suele señalar una política/claim/ruta;
- `permission denied` suele señalar privilegios del esquema, tabla, secuencia o
  función antes de que RLS pueda resolver el acceso.

**Comprobación mínima**

1. Identificar rol efectivo (`anon`, `authenticated`, `service_role` o rol DB).
2. Confirmar que la petición usa el proyecto y la sesión esperados.
3. Para SELECT/DELETE revisar `USING`; para INSERT/UPDATE revisar `WITH CHECK`.
4. Comparar tipos (`uuid` frente a `text`) y valores de `auth.uid()`.
5. Probar mediante el mismo cliente/sesión real que usa la aplicación.
6. Corregir con migración versionada y prueba de aislamiento.

Desactivar RLS solo puede usarse en una base local ficticia para aislar la
causa. Nunca es una corrección aceptable en staging o producción.

Referencias comunitarias contrastadas:

- [RLS: auth.uid, tipos, rol y USING/WITH CHECK](https://www.answeroverflow.com/m/1471174798070775994)
- [Permission denied no equivale siempre a RLS](https://www.answeroverflow.com/m/1333552912684552272)

### 6.3 Storage

Ante un 403 registrar bucket, operación (`insert`, `select`, `update`), ruta
normalizada y rol. Una subida puede necesitar política INSERT y, si la API
devuelve la fila o después se lee, también SELECT. Las políticas basadas en
carpetas deben compararse con el nombre real guardado, no con el nombre que se
creía haber enviado.

No hacer público un bucket ni conceder acceso general para ocultar una política
incorrecta. Probar con un objeto ficticio y borrar únicamente ese objeto tras
la validación cuando no exista retención inmutable.

Fuentes:

- [Storage 403 por RLS](https://supabase.com/docs/guides/troubleshooting/storage-error-403-forbidden-new-row-violates-row-level-security-policy-on-upload-a94384)
- [Códigos de error de Storage](https://supabase.com/docs/guides/storage/debugging/error-codes)
- [Caso comunitario: ruta/extensión no coincidente](https://www.answeroverflow.com/m/1411351619710357524/)

### 6.4 CLI, contraseña y conectividad PostgreSQL

Ante SASL/SCRAM:

1. validar que se usa la contraseña de base de datos, no una API key;
2. percent-encode de caracteres especiales solo dentro de una URI;
3. comprobar el host/puerto y si corresponde conexión directa o pooler;
4. revisar **Database Settings → Network Bans**;
5. evitar intentos repetidos: pueden activar bloqueo temporal.

Ante timeout o saturación revisar CPU, RAM, swap, disco/IO, consultas lentas y
número de conexiones. El pooler y la optimización son soluciones estructurales;
reiniciar únicamente puede aliviar temporalmente y borrar evidencia útil.

Fuentes:

- [CLI: SASL/invalid SCRAM](https://supabase.com/docs/guides/troubleshooting/supabase-cli-failed-sasl-auth-or-invalid-scram-server-final-message)
- [Connection refused y bloqueo de red](https://supabase.com/docs/guides/troubleshooting/error-connection-refused-when-trying-to-connect-to-supabase-database-hwG0Dr)
- [Connection timeout](https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout)
- [Problemas de HTTP API y recursos](https://supabase.com/docs/guides/troubleshooting/http-api-issues)
- [Caso comunitario: caracteres especiales en URI](https://www.answeroverflow.com/m/1010738132376887367/)

### 6.5 Dashboard y estado del proyecto

Si el Dashboard falla pero las rutas de la app y la base responden, tratarlo
como una incidencia de interfaz/cuenta antes que como corrupción de proyecto.

1. Verificar cuenta y organización.
2. Probar incógnito u otro navegador actualizado.
3. Comprobar Status y si la app/REST/DB responden por separado.
4. Capturar consola/red del Dashboard sin datos sensibles.
5. Escalar a soporte si el proyecto no aparece o queda atascado en pausa.

Fuente oficial:
[Dashboard/proyecto no carga](https://supabase.com/docs/guides/troubleshooting/supabase-dashboard-not-loading-project-not-loading-on-dashboard-LfMq9F).

### 6.6 Realtime

1. Registrar el estado devuelto por `subscribe` (`SUBSCRIBED`, `CLOSED`,
   `CHANNEL_ERROR`, `TIMED_OUT`).
2. Revisar Realtime Inspector/logs y el tema exacto.
3. Confirmar que no existen canales duplicados con el mismo tema.
4. Para canales privados, validar JWT y políticas de `realtime.messages`.
5. Revisar throttling del navegador y heartbeat en segundo plano.
6. Presence admite como máximo cinco actualizaciones cada 30 segundos por
   cliente; para alta frecuencia, limitar o usar Broadcast.

No convertir un canal privado en público como arreglo: cualquiera con la anon
key podría suscribirse según la configuración.

Fuentes:

- [Realtime troubleshooting](https://supabase.com/docs/guides/realtime/troubleshooting)
- [Realtime logger](https://supabase.com/docs/guides/troubleshooting/realtime-debugging-with-logger)
- [Desconexiones silenciosas](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)
- [Límite de Presence](https://supabase.com/docs/guides/troubleshooting/realtime-client-presence-rate-limit-reached)
- [Seguridad de Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

### 6.7 Management API y backups

La Management API usa un Personal Access Token de Supabase o OAuth, no las
claves `anon`/`service_role` del proyecto. Un 401 en
`supabase backups list --project-ref ...` ocurre antes de crear el backup
externo y debe resolverse como autenticación/permisos de Management API.

**Procedimiento**

1. Mantener `BACKUP_ENABLED=false` mientras se diagnostica.
2. Confirmar nombre, fecha y ubicación del secret sin leer ni mostrar su valor.
3. Verificar que el PAT pertenece a una cuenta con acceso a la organización y
   proyecto correctos.
4. Probar una única llamada de identidad/lectura con el PAT en entorno seguro,
   sin imprimir cabeceras ni token.
5. Confirmar permisos del endpoint; backups requiere lectura de backups
   (`backups_read`/scope equivalente).
6. Tras dos 401 idénticos, detener reintentos y abrir soporte con run IDs,
   project ref, timestamps y error redactado.
7. Solo tras resolver la autenticación: ejecutar una copia real supervisada,
   verificar checksum, marcador `COMPLETED`, restore kit y R2.

Los backups diarios del plan Pro protegen la base de datos durante su ventana
de retención, pero no incluyen los objetos de Storage. No sustituyen la copia
externa cifrada de OnyxLink.

Fuentes:

- [Management API](https://supabase.com/docs/reference/api/getting-started)
- [CLI y Personal Access Token](https://supabase.com/docs/reference/cli/getting-started)
- [Backups de Supabase](https://supabase.com/docs/guides/platform/backups)
- [CLI forbidden resource](https://supabase.com/docs/guides/troubleshooting/forbidden-resource-error-from-the-cli-L6rm6l)

## 7. Registro activo de OnyxLink

### INC-SUPABASE-2026-08-20 — primera copia externa de producción

**Estado:** resuelta el 21 de agosto de 2026.

**Impacto:** la aplicación de producción permaneció operativa. Los fallos
afectaron exclusivamente al workflow de la primera copia externa; ningún intento
fallido recibió el marcador `COMPLETED`.

**Causas confirmadas (evidencia propia, nivel A):**

1. Los PAT iniciales de Supabase estaban caducados y el token fino necesitaba
   permiso de lectura de backups. El PAT nuevo se validó primero mediante
   `supabase backups list`; el workflow fuerza `--output json` antes de pasarlo a
   `jq`.
2. La URL de PostgreSQL necesitaba la contraseña vigente, percent-encoded dentro
   de la URI del Session Pooler. Una actualización de secret mediante pipe de
   PowerShell llegó vacía; se corrigió desde la interfaz de GitHub y el workflow
   valida que la variable no esté vacía.
3. Ubuntu aportaba `pg_dump 16` para un servidor PostgreSQL 17. El dump forense
   quedó fijado a la imagen oficial PostgreSQL 17.6 de Supabase por digest.
4. R2 requiere el endpoint de cuenta sin añadir el bucket y una pareja
   `Access Key ID`/`Secret Access Key` del mismo token R2. El campo `Token value`
   no es una credencial S3. El token definitivo usa `Object Read & Write` y está
   limitado a `onyxlink-backups-production`.
5. `apt` instalaba `rclone 1.60.1`. Esa versión escribía el objeto pero recibía
   HTTP 501 en una operación posterior; el reintento con `--immutable` encontraba
   el objeto parcial y abortaba. Se sustituyó por `rclone 1.75.0`, descargado con
   versión y SHA-256 fijados.

**Validación final:** workflow
[32463038193](https://github.com/onyxlink-AI/whatsapp-saas/actions/runs/32463038193),
SHA `9cac97a26664be05f1df39bddb1197748015fcc3`, resultado `success`.
El snapshot `daily/20260821T082502Z` se creó cifrado, recibió `COMPLETED`, se
descargó de nuevo desde R2 y pasó checksum y validación del archivo. Se verificó
un objeto de Supabase Storage, no se publicó ningún artifact en GitHub Actions y
`BACKUP_ENABLED` terminó en `false`.

**Regla operativa derivada:** antes de un backup completo, comprobar versión de
las herramientas y acceso de lectura de Supabase/R2. Un snapshot incompleto no
se reintenta sobre la misma ruta; se usa un identificador nuevo y solo se declara
válido cuando existe `COMPLETED` y `backup:verify` termina correctamente.

### Incidencia oficial simultánea: rechazos JWT

El 20 de agosto de 2026 Supabase mostraba servicio parcialmente degradado por
una incidencia identificada como **“401 errors due to JWT rejections”**, con un
despliegue correctivo progresivo para determinados proyectos/API Gateway.

- [Incidencia oficial](https://stspg.io/18v97b9scdh2)
- [Incidencias abiertas en JSON](https://status.supabase.com/api/v2/incidents/unresolved.json)

Esta incidencia puede explicar un aumento de mensajes comunitarios y errores de
sesión/JWT. **No demuestra** que el 401 del endpoint de backups tenga la misma
causa: Management API figuraba operativa y usa PAT. Mantener ambas hipótesis
separadas hasta que soporte responda.

## 8. Plantilla de escalado a Supabase Support

```text
Organization/project: [nombre y project ref; nunca claves]
UTC timestamp(s): [fecha y hora]
Environment: production/staging/local
Affected component: Auth/API Gateway/Database/Storage/Realtime/Management API
Exact operation: [ruta o comando sin secretos]
HTTP/status and exact redacted error: [...]
Request ID / workflow run ID: [...]
Scope: one user / one workspace / all users
Last known good time: [...]
Last relevant deployment/migration SHA: [...]
Safe checks already performed: [...]
Status page incident checked: yes/no + incident link
Changes deliberately NOT performed: no token rotation, no RLS disable, etc.
```

Adjuntar capturas o logs mínimos. Nunca adjuntar `.env`, JWT, cookies, PAT,
service role key, contraseña de base de datos ni exportaciones completas.

## 9. Acciones prohibidas sin diagnóstico y autorización

- Desactivar RLS o hacer público un bucket en producción.
- Ejecutar SQL copiado de Discord sobre `auth.*` o producción.
- Borrar usuarios, tablas, migraciones o snapshots para “probar”.
- Rotar todas las credenciales ante un único 401.
- Reintentar el mismo workflow más de dos veces sin evidencia nueva.
- Usar `service_role` en navegador o compartirlo en soporte/Discord.
- Reiniciar el proyecto como solución permanente a saturación.
- Afirmar que existe un backup externo sin `COMPLETED` y verificación de restore.

## 10. Cómo incorporar nuevos casos de Discord

1. Guardar enlace del mensaje o de su espejo indexado, fecha y síntoma exacto.
2. Eliminar nombres, correos, IDs y secretos de terceros.
3. Buscar documentación/estado oficial y otros casos del mismo patrón.
4. Clasificar la evidencia A/B/C.
5. Reproducir únicamente en local o staging con datos ficticios cuando sea
   posible.
6. Añadir una fila a la matriz y un procedimiento solo si aporta una decisión
   nueva; evitar duplicados.
7. Registrar qué prueba confirma la solución y cuándo deja de ser válida.
8. Publicar el cambio mediante PR y revisión, igual que cualquier runbook.

El índice comunitario utilizado para esta primera recopilación es
[Answer Overflow — Supabase](https://www.answeroverflow.com/c/839993398554656828),
que refleja mensajes públicos indexados del servidor. Cuando Discord requiera
sesión o no permita lectura verificable, no se inventará ni resumirá contenido
inaccesible.

## 11. Cierre de una incidencia

Una incidencia solo se cierra cuando constan:

- causa confirmada o explicación oficial;
- corrección exacta y reversible;
- validación local/staging proporcional al riesgo;
- resultado en producción y periodo de observación;
- ausencia de regresiones de seguridad/RLS;
- estado de backup y recuperación;
- actualización de este documento si apareció un patrón nuevo.

La conversación no es la fuente de verdad. Este archivo versionado lo es.

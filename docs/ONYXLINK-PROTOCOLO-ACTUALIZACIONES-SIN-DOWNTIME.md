# Protocolo obligatorio de actualizaciones sin interrupción

**Aplicación:** OnyxLink en producción desde el primer cliente real.  
**Objetivo:** publicar mejoras sin cerrar el panel, perder datos ni obligar al
cliente a interrumpir su trabajo.

> No existe el riesgo cero. Este protocolo reduce el riesgo, detecta una
> regresión rápidamente y permite volver a una versión estable sin improvisar.

## 1. Frecuencia

| Tipo | Frecuencia | Regla |
|---|---|---|
| Cambios normales | Una publicación semanal | Staging automático el martes a las 05:30 UTC; producción a las 09:00 Europe/Madrid, con una persona disponible para supervisar. |
| Funciones grandes | Quincenal o mensual | Llegan desactivadas mediante feature flag y se habilitan después de verificar producción. |
| Seguridad crítica | Inmediata | Alcance mínimo, revisión rápida y monitorización reforzada. |
| Documentación o trabajo interno | Cuando sea necesario | No desplegar si no modifica la aplicación. |

Se puede desarrollar y crear previews todos los días. Lo que se agrupa es la
publicación estable, para no someter al cliente a cambios continuos e
imprevisibles.

## 2. Reglas que nunca se pueden saltar

1. Nunca probar una función por primera vez en producción.
2. Nunca desplegar con tests, typecheck, lint o build en rojo.
3. Nunca cambiar una tabla de forma incompatible con la versión que todavía
   está atendiendo peticiones.
4. Nunca renombrar o eliminar una columna, tabla, función o valor de enum en la
   misma publicación que introduce su sustituto.
5. Nunca ejecutar `supabase db reset`, el seed local ni SQL manual no versionado
   contra producción.
6. Nunca usar force-push ni desplegar un working tree distinto de `origin/main`.
7. Nunca activar una función grande para todos los clientes a la vez.
8. Nunca declarar éxito sin una comprobación con sesión real y revisión de
   logs.
9. Nunca revertir una migración usada por clientes mediante `DROP` improvisado.
10. Nunca depender únicamente del backup de base de datos para Supabase
    Storage: los objetos necesitan copia independiente.

## 3. Modelo de base de datos: expandir, migrar y retirar

Toda modificación incompatible se divide como mínimo en dos publicaciones.

### Publicación A: expandir

- Añadir columnas/tablas/funciones nuevas; no borrar las antiguas.
- Usar columnas nullable o defaults seguros.
- Mantener RLS y aislamiento por `workspace_id` desde el primer momento.
- Si cambia un formato, permitir temporalmente leer el formato antiguo y el
  nuevo.
- Desplegar código capaz de funcionar con ambos formatos.
- Hacer backfill por lotes pequeños, reanudables e idempotentes.
- Activar la función mediante feature flag solo después del smoke test.

### Periodo de convivencia

- La versión anterior y la nueva deben poder usar la misma base de datos.
- Monitorizar errores, latencia, bloqueos y filas pendientes de backfill.
- Mantener al menos una publicación estable completa antes de retirar nada.

### Publicación B: retirar

- Confirmar que ningún código, job o cliente usa el campo anterior.
- Retirar primero las lecturas/escrituras antiguas del código.
- Solo en una publicación posterior eliminar objetos obsoletos.
- Crear una migración versionada; nunca ejecutar el borrado a mano.

## 4. Feature flags

Toda función grande, integración o automatización nueva debe tener una bandera
por workspace o un entitlement equivalente.

Orden de activación:

1. OnyxLink interno.
2. Workspace de prueba.
3. Un cliente piloto que lo haya aceptado.
4. 10-25 % de clientes.
5. Todos los clientes después de un periodo estable.

Apagar la bandera debe detener la nueva función sin eliminar sus datos y sin
necesitar otro despliegue.

## 5. Preparación semanal

### Hasta 48 horas antes

- Cerrar el alcance de la versión; no añadir cambios de última hora.
- Revisar diferencias contra `origin/main` y todas las migraciones nuevas.
- Revisar dependencias, variables y costes externos.
- Crear preview de Vercel y probar escritorio/móvil.
- Ejecutar aislamiento Empresa A/B y roles reales.
- Verificar que los cambios de UI conservan deep links y navegación.

### Validación obligatoria

```bash
supabase db reset
npm run typecheck
npm run lint
npx vitest run --no-file-parallelism
npm run build
git diff --check
```

Además:

- Playwright de los recorridos modificados.
- Comprobación de RLS/RPC/grants si cambia Supabase.
- Preflight específico de datos cuando exista, por ejemplo Board.
- Working tree limpio salvo archivos locales protegidos conocidos.

## 6. Backups antes de publicar

Antes de cualquier migración:

1. Confirmar Supabase Pro y al menos un backup físico `COMPLETED`.
2. Registrar la fecha del último backup y su retención.
3. Si la migración transforma o borra datos y no existe PITR, crear además una
   copia lógica cifrada inmediatamente anterior.
4. Guardar la contraseña solo en Bitwarden; nunca en chats o informes.
5. Mantener una copia independiente de los buckets de Storage afectados.
6. Guardar SHA de `origin/main` y deployment estable de Vercel.

Un backup diario puede tener varias horas. Para una migración destructiva no es
suficiente por sí solo sin PITR o una copia lógica inmediatamente anterior.

## 7. Orden del despliegue sin downtime

1. Congelar el SHA candidato.
2. Confirmar backup, preflights y compatibilidad con la versión anterior.
3. Aplicar únicamente migraciones **aditivas y compatibles**.
4. Verificar migraciones, RLS, grants y salud de Supabase.
5. Hacer push fast-forward del SHA validado.
6. Desplegar ese SHA exacto en Vercel.
7. Esperar estado `Ready`; no mover el alias si el build falla.
8. Confirmar `onyxlinkpanel.com` y ejecutar health checks sin sesión.
9. Ejecutar smoke test con sesión real en un workspace interno.
10. Activar feature flag solo para OnyxLink interno.
11. Observar logs y métricas durante un mínimo de 15 minutos.
12. Ampliar progresivamente la activación si no hay regresiones.

Durante el cambio pueden coexistir funciones de la versión anterior y la nueva.
Por eso la base de datos debe ser compatible con ambas.

## 8. Smoke test mínimo

- Login y cierre de sesión.
- Selección del workspace correcto.
- Dashboard y navegación principal.
- Lectura y una escritura segura en el área modificada.
- Rol administrador y un rol limitado.
- Aislamiento entre dos workspaces.
- Móvil y escritorio.
- Webhooks/crons afectados.
- Consola del navegador sin errores.
- Logs de Vercel y Supabase sin errores nuevos.
- Confirmación de que ninguna clave o dato privado aparece en logs.

## 9. Monitorización y rollback

### Señales para detener la publicación

- Aumento de errores 5xx.
- Fallos de login o autorización.
- Lecturas/escrituras cruzadas entre workspaces.
- Pérdida, duplicación o corrupción de datos.
- Webhooks acumulándose o crons fallando.
- Latencia claramente superior a la versión estable.

### Rollback de aplicación

1. Apagar la feature flag si el problema está aislado.
2. Promocionar el deployment estable anterior de Vercel.
3. Confirmar que la base de datos ampliada sigue siendo compatible con ese
   deployment.
4. Abrir una corrección nueva; nunca reescribir Git.

### Problema de base de datos

- Detener despliegues y jobs que escriban datos afectados.
- No ejecutar SQL inverso improvisado.
- Preferir una migración correctiva hacia delante.
- Restaurar backup únicamente si existe corrupción material y se ha evaluado la
  pérdida de datos posterior al punto restaurado.

## 10. Mantenimiento visible al cliente

Una publicación normal no requiere pantalla de mantenimiento. Solo se permite
una ventana anunciada cuando una operación sea realmente incompatible y no
pueda dividirse con el patrón expandir/migrar/retirar.

En ese caso:

- avisar con al menos 72 horas;
- elegir la franja real de menor uso;
- objetivo máximo de 15-30 minutos, nunca dos horas como procedimiento normal;
- ofrecer estado y confirmación de finalización;
- tener rollback ensayado antes de comenzar.

Si una actualización exige dos horas de cierre, su arquitectura debe revisarse
antes de aceptarla.

## 11. Informe obligatorio de cada versión

- SHA de GitHub y deployment ID.
- Backup y Storage comprobados.
- Migraciones aplicadas.
- Tests y preflights.
- Workspaces/feature flags activados.
- Smoke test con sesión real.
- Resultado A/B y roles.
- Logs durante la observación.
- Rollback disponible.
- Estado de Git y copia externa.
- Riesgos o verificaciones aplazadas, sin ocultarlos.

## 12. Responsabilidad

- Codex define arquitectura, alcance, UX, compatibilidad y criterio de
  aceptación.
- Claude Code implementa, prueba y prepara la entrega técnica.
- Ningún agente despliega sin autorización expresa del propietario de
  OnyxLink.
- El propietario confirma cambios comerciales, ventanas excepcionales y la
  activación para clientes reales.

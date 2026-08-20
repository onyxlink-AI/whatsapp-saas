# Runbook: publicación temporal mientras R2 está pendiente

**Owner:** OnyxLink

**Frecuencia:** cuando una versión autorizada deba llegar a producción

**Última actualización:** 20/08/2026

**Última ejecución:** 20/08/2026

**Estado:** temporal y activo hasta cumplir la salida indicada en la sección 10

## 1. Propósito

Publicar versiones de OnyxLink con un procedimiento repetible mientras el
backup externo automático permanece bloqueado por un `401 Unauthorized` de la
Management API de Supabase.

Este procedimiento reduce el riesgo, pero no promete riesgo cero. No sustituye
definitivamente el backup cifrado en R2 ni autoriza a saltarse pruebas,
migraciones versionadas o aprobación humana.

## 2. Contexto del bloqueo

- El Environment `backup-production` está configurado.
- El bucket privado `onyxlink-backups-production` existe y tiene bloqueo de
  objetos.
- `BACKUP_ENABLED` debe permanecer en `false`.
- Dos ejecuciones reales se detuvieron en la primera comprobación de solo
  lectura: `supabase backups list` devolvió `401 Unauthorized`.
- Nunca se ejecutó `backup:create`, nunca se subió un snapshot real y no existe
  todavía un marcador `COMPLETED` recuperable en R2.
- Existe una solicitud abierta con Supabase Support. No rotar ni volver a
  probar tokens por rutina mientras se espera su respuesta.

## 3. Cuándo se permite usar

Solo para cambios que cumplan todas estas condiciones:

- probados en Supabase local y staging;
- CI real de Linux en verde;
- migraciones exclusivamente aditivas y compatibles con la versión anterior;
- ninguna eliminación o transformación irreversible de datos;
- backup físico reciente visible manualmente en Supabase Dashboard;
- código exacto protegido en GitHub y copia fechada en disco externo;
- deployment anterior de Vercel identificado;
- autorización literal `PUBLICAR` del propietario.

No usar este procedimiento para migraciones destructivas, rotación masiva de
secretos, borrados, cambios de cifrado, movimientos de Storage ni incidentes de
integridad.

## 4. Prerrequisitos

- [ ] `origin/main` contiene únicamente el candidato aprobado.
- [ ] SHA completo registrado.
- [ ] Staging probado con sesión interna y rol limitado cuando corresponda.
- [ ] Supabase Production → Database → Backups muestra un backup físico reciente.
- [ ] Se ha registrado la hora del backup y el posible intervalo de datos no
      cubierto desde ese momento.
- [ ] Copia Git limpia y fechada en el disco externo, sin sobrescribir otra.
- [ ] `git fsck --full` y `git status --short` correctos en la copia.
- [ ] Working tree de desarrollo preservado; se usará un worktree limpio.
- [ ] Deployment estable de Vercel registrado para rollback.
- [ ] Ventana de baja actividad y una persona disponible durante 15 minutos.

## 5. Validación reproducible

### Paso 1: worktree corto y limpio

En Windows, usar una ruta corta nueva, por ejemplo
`C:\olx-pub-<sha-corto>`. No borrar ni reutilizar una carpeta desconocida.

**Resultado esperado:** HEAD coincide exactamente con el SHA autorizado y
`git status --short` está vacío.

**Si falla:** detenerse. Nunca desplegar la carpeta de trabajo sucia.

### Paso 2: instalar dependencias

```powershell
npm ci
```

**Resultado esperado:** instalación reproducible sin cambios en archivos
versionados.

### Paso 3: Supabase local y validación

1. Arrancar Supabase exclusivamente local.
2. Obtener `API_URL`, `ANON_KEY` y `SERVICE_ROLE_KEY` mediante
   `supabase status --output json`.
3. Exponerlos como variables locales requeridas por la suite.
4. Ejecutar typecheck, lint, pruebas y build.
5. Detener con `supabase stop --no-backup`, incluso si falla.

**Resultado esperado:** validaciones verdes.

**Si falla:** detenerse y diagnosticar antes de tocar producción.

### Excepciones conocidas de esta máquina Windows

Estas excepciones solo se aceptan si el mismo SHA tiene CI Linux verde:

| Síntoma | Causa conocida | Acción correcta |
|---|---|---|
| `backup:test` falla al crear/rechazar symlinks | Windows no concede `SeCreateSymbolicLinkPrivilege` | Confirmar el workflow sintético Linux verde; no debilitar la prueba. |
| Turbopack indica que una ruta excede el máximo | Worktree demasiado profundo | Recrear el worktree en una ruta corta y repetir solo el build. |
| Integraciones fallan con cliente DB indefinido | Supabase local no estaba arrancado o faltaban variables | Arrancar Supabase local, configurar sus variables y repetir una vez. |

No convertir un fallo distinto en “error ambiental” sin evidencia.

## 6. Preflight remoto de solo lectura

1. Confirmar que el proyecto enlazado es exactamente el Supabase Production
   autorizado.
2. Ejecutar `supabase migration list --linked`.
3. Enumerar y revisar todas las migraciones pendientes.
4. Ejecutar `supabase db push --linked --dry-run`.
5. Confirmar que no aparece ninguna migración adicional.

**Resultado esperado:** el dry-run coincide exactamente con el alcance aprobado.

**Si falla:** detenerse; no reparar el historial de migraciones durante la
ventana de publicación.

## 7. Publicación manual autorizada

Solo después de recibir `PUBLICAR`:

1. Registrar el deployment estable actual de Vercel.
2. Aplicar mediante `supabase db push --linked` únicamente las migraciones
   versionadas y aprobadas.
3. Repetir `supabase migration list --linked` y confirmar sincronización.
4. Desplegar a Vercel Production desde el worktree limpio del SHA exacto.
5. Esperar `READY` y confirmar que `onyxlinkpanel.com` apunta al deployment.

No utilizar SQL manual, `db reset`, seeds, la carpeta de desarrollo sucia ni un
SHA diferente. No cambiar tokens, secrets, `BACKUP_ENABLED` o R2 como parte de
una publicación normal.

## 8. Verificación posterior

- [ ] `/login` responde 200.
- [ ] `/dashboard` sin sesión responde con la redirección esperada.
- [ ] APIs protegidas sin sesión responden 401, no 404 ni 500.
- [ ] Rutas nuevas sin sesión no exponen contenido interno.
- [ ] Smoke test con superadministrador real.
- [ ] Lectura y una escritura segura en la función publicada.
- [ ] Cliente normal sin acceso a la zona interna.
- [ ] Sin errores 5xx nuevos.
- [ ] Logs de Vercel y Supabase observados durante 15 minutos.
- [ ] Informe final con SHA, deployment, migraciones, backup y rollback.

## 9. Parada y rollback

### Reglas de parada

- Detenerse en el primer resultado inesperado.
- No reintentar automáticamente un comando remoto fallido.
- No improvisar una migración o cambio de permisos.
- No continuar desde una migración adicional no revisada.

### Si falla antes de aplicar migraciones

Producción queda intacta. Corregir fuera de la ventana y repetir desde el
principio.

### Si las migraciones terminan y Vercel falla

No revertir esquema aditivo. Mantener el deployment anterior, comprobar su
compatibilidad y preparar una corrección hacia delante.

### Si el nuevo deployment presenta una regresión

Promocionar el deployment estable registrado, comprobar dominio y login, y
abrir una corrección. Nunca ejecutar `DROP` o SQL inverso improvisado.

### Si existe corrupción material de datos

Detener escrituras, escalar y evaluar el backup físico con Supabase antes de
restaurar. Una restauración puede perder todos los cambios posteriores a su
hora; nunca iniciarla automáticamente.

## 10. Criterio de retirada

Este runbook deja de estar activo solo cuando se cumplan todos estos puntos:

1. Supabase Support resuelve o explica el `401`.
2. El workflow real genera un snapshot cifrado en R2.
3. El snapshot contiene marcador `COMPLETED`.
4. La verificación desde cero es correcta.
5. Se prepara y valida un restore kit.
6. `production.yml` tiene sus secrets, se audita y vuelve a ser la vía oficial.
7. El propietario aprueba explícitamente retirar la excepción temporal.

Hasta entonces, esta conversación queda reservada al incidente de backup y las
nuevas funciones se desarrollan en conversaciones separadas.

## 11. Historial

| Fecha | Ejecutado por | Resultado |
|---|---|---|
| 20/08/2026 | OnyxLink / Claude Code / Codex | Publicación manual del SHA `c058318f...`: tres migraciones sincronizadas, Vercel `READY` y smoke público inicial verde. |

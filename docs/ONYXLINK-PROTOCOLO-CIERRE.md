# Protocolo obligatorio de cierre de trabajos de OnyxLink

**Propietario:** NexorLabs / OnyxLink
**Responsable de ejecución:** la persona o asistente que realice el cambio
**Frecuencia:** al terminar cualquier tarea sobre el proyecto oficial
**Última actualización:** 30 de julio de 2026

## 1. Objetivo

Este protocolo hace que código, producción, datos y accesos se mantengan
recuperables. No se considera terminado un trabajo hasta revisar los puntos que
le correspondan y comunicar su estado.

Desde el primer cliente real, cualquier despliegue debe cumplir además
`docs/ONYXLINK-PROTOCOLO-ACTUALIZACIONES-SIN-DOWNTIME.md`, especialmente el
patrón compatible **expandir → convivir → retirar**.

## 2. Prerrequisitos

- Acceso autorizado al repositorio y a la rama de trabajo.
- Acceso a GitHub y, cuando corresponda, Vercel y Supabase.
- Bitwarden y el disco externo disponibles cuando cambien accesos o se cierre
  una versión importante.
- Alcance del trabajo claro, especialmente si incluye producción o datos
  remotos.

## 3. Antes de modificar nada

1. Confirmar que se está trabajando en el repositorio oficial:
   `C:\Users\NexorLabs\OneDrive\Desktop\ONYXLINK\APPS\whatsapp-saas`.
2. Leer `AGENTS.md`, `CLAUDE.md`, este protocolo y, para recuperación,
   `docs/ONYXLINK-RUNBOOK-RECUPERACION.md`.
3. Ejecutar:

   ```powershell
   git branch --show-current
   git status -sb
   git remote -v
   ```

4. Identificar y conservar cambios anteriores del usuario. No sobrescribirlos,
   borrarlos ni incluirlos accidentalmente en otro commit.
5. No tocar ni versionar estos scripts locales protegidos:

   - `scripts/check-secret-prefix.ts`
   - `scripts/diagnose-ycloud-live-webhook.ts`
   - `scripts/diagnose-ycloud.ts`

## 4. Validación antes de guardar

La validación debe ser proporcional al cambio. Para código de producto:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
git diff --check
```

Para cambios visuales, comprobar además las pantallas afectadas en escritorio y
móvil, los roles de superadministrador y cliente, la consola del navegador y
los estados vacío, carga y error. Una modificación solo documental puede
cerrarse con revisión del diff y `git diff --check`.

**Resultado esperado:** todas las comprobaciones aplicables pasan, no aparecen
secretos ni cambios ajenos y el comportamiento solicitado funciona.

## 5. GitHub: obligatorio en cada trabajo terminado

1. Revisar exactamente qué se va a guardar:

   ```powershell
   git status --short
   git diff --stat
   git diff --check
   ```

2. Añadir rutas concretas. Evitar `git add -A` si existen cambios ajenos.
3. Crear un commit descriptivo.
4. Antes de publicar:

   ```powershell
   git fetch origin
   git status -sb
   ```

5. Subir la rama o `main` siguiendo el flujo autorizado.
6. Confirmar que el commit local y el remoto coinciden:

   ```powershell
   git rev-parse HEAD
   git rev-parse origin/main
   ```

Nunca subir:

- `.env`, `.env.local` ni otras variantes con secretos.
- Exportaciones de Bitwarden, aunque estén cifradas.
- Copias de bases de datos, credenciales o tokens.
- `.vercel`, `.next`, `node_modules` o archivos temporales.
- Los tres scripts locales protegidos indicados anteriormente.

## 6. Vercel: solo cuando el cambio debe llegar a producción

No todo commit necesita despliegue. Desplegar únicamente cuando el alcance
autorizado incluya producción y la versión completa haya sido validada.

Después del despliegue:

1. Confirmar estado **Ready** en Vercel.
2. Confirmar que `onyxlinkpanel.com` apunta al despliegue correcto.
3. Probar login, navegación principal, roles y la funcionalidad modificada.
4. Revisar logs de producción y la consola del navegador.

Un cambio solo documental o local se publica en GitHub, pero no se despliega.

## 7. Supabase: cuando cambien esquema, datos o Storage

1. Probar migraciones desde cero contra Supabase local:

   ```powershell
   npx.cmd supabase db reset
   ```

2. Versionar la migración y las pruebas correspondientes.
3. Antes de aplicar una migración remota, confirmar una copia recuperable de la
   base de datos de producción y revisar el SQL.
4. Aplicar cambios remotos solo con autorización expresa.
5. Verificar RLS, aislamiento entre empresas, autenticación y datos existentes.
6. Si se usa Supabase Storage, mantener una copia independiente de sus objetos.

Nunca ejecutar `supabase db reset` ni cargar el seed contra producción.

## 8. Copia local en disco externo

Después de una versión importante o un hito terminado:

1. Verificar primero que GitHub contiene el último commit.
2. Copiar la carpeta oficial completa:
   `C:\Users\NexorLabs\OneDrive\Desktop\ONYXLINK\APPS\whatsapp-saas`.
3. Guardarla en el disco externo dentro de una carpeta fechada.
4. Incluir la carpeta oculta `.git`.
5. Comprobar que la copia contiene `src`, `supabase`, `docs`,
   `package.json`, `package-lock.json` y `.git`.

`node_modules` y `.next` se pueden regenerar y no son la fuente de verdad. La
copia local complementa a GitHub; no lo sustituye.

## 9. Bitwarden y copia cifrada de accesos

Cada vez que cambie una contraseña, API key, variable de entorno, segundo
factor o acceso:

1. Actualizar el elemento correspondiente dentro de la carpeta `ONYXLINK` de
   Bitwarden.
2. Actualizar el elemento que contiene las variables necesarias para recuperar
   el proyecto, sin pegar sus valores en chats, documentación ni Git.
3. Crear una nueva exportación JSON protegida con contraseña. Debe ser una
   exportación cifrada que pueda importarse para recuperación, no una copia
   ligada exclusivamente a la cuenta actual.
4. Guardar esa exportación únicamente en el disco externo.
5. Eliminar cualquier archivo temporal o exportación sin cifrar.
6. Mantener por separado y fuera del ordenador:

   - contraseña maestra de Bitwarden;
   - códigos de recuperación 2FA;
   - contraseña de la exportación cifrada.

Nunca guardar la exportación en GitHub, correo, chat o dentro del proyecto.

## 10. Informe obligatorio al terminar

La entrega final debe indicar claramente:

- **Código:** validaciones ejecutadas y resultado.
- **GitHub:** rama y commit publicados, o motivo exacto si quedó pendiente.
- **Producción:** desplegada y verificada, o “sin despliegue” por ser un cambio
  local/documental.
- **Supabase:** sin cambios, solo local o migración remota autorizada.
- **Copia externa:** realizada o recordatorio pendiente para el propietario.
- **Bitwarden:** actualizado si cambiaron accesos; nunca mostrar valores.
- **Archivos protegidos:** confirmación de que siguen fuera del commit.

## 11. Fallos habituales

| Fallo | Acción segura |
|---|---|
| La rama local y GitHub han divergido | Detener el push, comparar commits y conservar ambos trabajos; no usar `reset --hard`. |
| Falla una validación | No desplegar. Corregir o documentar el bloqueo con evidencia. |
| Vercel falla | Mantener el despliegue estable anterior y revisar build, variables y logs. |
| No está conectado el disco externo | Terminar GitHub y dejar el recordatorio explícito; no afirmar que existe una copia. |
| Una clave aparece oculta y no puede recuperarse | No inventarla; obtener una nueva, rotarla y actualizar Vercel, Supabase y Bitwarden. |
| Falta copia previa de Supabase | No aplicar migraciones remotas hasta disponer de una copia recuperable. |
| Se expuso una credencial | Revocarla inmediatamente, rotarla, revisar logs y actualizar Bitwarden y la exportación cifrada. |

## 12. Rollback

1. Detener nuevos cambios y conservar evidencia del fallo.
2. En código, crear un commit de reversión revisable; no borrar historia ni usar
   `git reset --hard`.
3. En Vercel, mantener o promocionar el último despliegue estable.
4. No improvisar una reversión SQL si ya se aplicó una migración: usar una
   migración correctiva revisada o la copia previa.
5. Si el problema afecta a secretos, rotarlos antes de volver a desplegar.

## 13. Historial

| Fecha | Responsable | Nota |
|---|---|---|
| 30/07/2026 | Codex / OnyxLink | Primera versión del protocolo permanente de cierre, GitHub, producción, Supabase, copia externa y Bitwarden. |

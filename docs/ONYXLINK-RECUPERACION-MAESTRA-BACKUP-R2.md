# Runbook maestro: reconstruir y restaurar el backup externo de OnyxLink

**Propietario:** NexorLabs / OnyxLink

**Frecuencia:** en una pérdida total, rotación de credenciales o prueba de recuperación

**Última actualización:** 21 de agosto de 2026

**Estado:** primera copia real completada y verificada; automatización diaria desactivada

**Tiempo objetivo de reconstrucción:** 60–120 minutos, sin contar la transferencia de grandes volúmenes

## 1. Propósito y autoridad

Este documento permite reconstruir el sistema de copia externa de OnyxLink sin
depender de una conversación anterior. Contiene los identificadores seguros,
los nombres que deben buscarse en Bitwarden, los 13 secrets de GitHub, el flujo
correcto de creación y verificación, la preparación de un kit de restauración y
los errores reales que costaron aproximadamente 48 horas.

No contiene contraseñas, tokens, API keys ni claves de cifrado. Los valores
siguen viviendo únicamente en Bitwarden y en GitHub Environments.

Si este documento contradice instrucciones antiguas sobre el primer montaje de
R2, prevalece este runbook para el sistema que quedó probado el 21/08/2026. Para
incidencias generales de Supabase se complementa con
`ONYXLINK-RUNBOOK-SUPABASE-INCIDENTES.md`.

## 2. Qué quedó probado

| Elemento | Valor o estado verificado |
|---|---|
| Repositorio | `onyxlink-AI/whatsapp-saas` |
| Workflow | `.github/workflows/backup-production.yml` |
| Nombre visible en Actions | `Copia externa cifrada de producción` |
| Supabase producción | proyecto `onyxlink-AI`, ref `uyrrunmqzdisplbdtabi` |
| R2 | bucket privado `onyxlink-backups-production`, jurisdicción EU |
| Retención actual | Bucket Lock uniforme de 30 días para todos los objetos |
| Ejecución válida | GitHub Actions run `32463038193` |
| SHA que creó la copia | `9cac97a26664be05f1df39bddb1197748015fcc3` |
| Snapshot válido | `daily/20260821T082502Z` |
| Resultado | `COMPLETED`, checksum correcto y descarga de comprobación correcta |
| Supabase Storage | 1 objeto verificado en esa ejecución |
| Artifacts en GitHub | 0; los datos nunca se publican como artifacts |
| Puerta automática | `BACKUP_ENABLED=false` |
| Versión de rclone | `v1.75.0`, SHA-256 fijado en el workflow |
| Cliente PostgreSQL forense | imagen oficial Supabase PostgreSQL 17.6 fijada por digest |

La copia incluye:

- `roles.sql`, `schema.sql` y `data.sql`, que forman la ruta principal de
  restauración lógica recomendada por Supabase;
- `full-database.dump`, archivo forense adicional;
- los objetos de todos los buckets accesibles por el endpoint S3 de Supabase;
- `manifest.json`, checksum SHA-256 y marcador final `COMPLETED`.

Un directorio remoto sin `COMPLETED` **no es una copia válida**.

## 3. Mapa rápido de sistemas

```text
Supabase Production
  ├─ PostgreSQL ──┐
  └─ Storage S3 ──┼─> GitHub Actions (runner efímero)
                  │      ├─ dumps lógicos + dump forense
                  │      ├─ manifiesto + SHA-256
                  │      └─ rclone crypt
                  └──────────────────────────────> Cloudflare R2 privado
                                                     ├─ Bucket Lock 30 días
                                                     ├─ daily/<snapshot>
                                                     └─ monthly/<mes>/<snapshot>
```

GitHub conserva el código del mecanismo, Bitwarden conserva las credenciales y
R2 conserva las copias cifradas. Perder uno de esos tres sistemas no debería
impedir recuperar los otros dos.

## 4. Inventario de nombres: qué buscar exactamente

### 4.1 Elementos confirmados en Bitwarden

Buscar primero estos títulos exactos dentro de la carpeta `ONYXLINK`:

| Título exacto | Qué debe contener | No confundir con |
|---|---|---|
| `ONYXLINK — Supabase CI Access Token` | PAT activo de Supabase Management API utilizado como `SUPABASE_ACCESS_TOKEN`; organización/proyecto y permiso de lectura de backups | `anon`, `service_role`, contraseña de la base o PAT de staging |
| `ONYXLINK — Cloudflare R2 Backup Production Credentials v2` | R2 Access Key ID, R2 Secret Access Key, endpoint, bucket y referencia del token activo | el campo Cloudflare `Token value`, que no sirve como credencial S3 |

Los valores nunca se copian a este documento. Si el título de una nota se
hubiera cambiado, buscar por los nombres de campo de las secciones siguientes.

### 4.2 Nombres de proveedor que ayudan a localizar credenciales

| Proveedor | Nombre que debe aparecer | Estado/uso |
|---|---|---|
| Cloudflare R2 Account API token | `onyxlink-backup-production-ci-v2` | Activo; `Object Read & Write`, solo bucket `onyxlink-backups-production`; vencimiento previsto 19/08/2027 |
| Cloudflare R2 token anterior | `onyxlink-backup-production-ci` | Antiguo; confirmar que esté revocado y no usar |
| Supabase PAT antiguo | `onyxlink-backup-production-ci` | Caducado; no usar |
| Supabase PAT antiguo | `onyxlink-github-ci` | Caducado; no usar |
| Supabase staging | `onyxlink-staging-ci-v2` | Exclusivo de staging; nunca usar para el backup de producción |

El nombre del token de Cloudflare y el de un PAT antiguo de Supabase pueden ser
parecidos. La ubicación del proveedor es la que determina qué credencial es.

### 4.3 Campos que deben poder localizarse en Bitwarden

Aunque estén repartidos entre varias notas seguras, una búsqueda debe permitir
encontrar estos nombres. Los 13 coinciden uno a uno con GitHub:

```text
SUPABASE_ACCESS_TOKEN
PRODUCTION_SUPABASE_PROJECT_REF
PRODUCTION_SUPABASE_DB_URL
PRODUCTION_SUPABASE_S3_ENDPOINT
PRODUCTION_SUPABASE_S3_REGION
PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID
PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
RCLONE_CRYPT_PASSWORD
RCLONE_CRYPT_PASSWORD2
```

Regla crítica: si faltan `RCLONE_CRYPT_PASSWORD` o
`RCLONE_CRYPT_PASSWORD2`, no regenerarlas para intentar abrir copias antiguas.
Una pareja nueva crea otro cifrado y no puede descifrar los snapshots actuales.

También deben custodiarse por separado `ENCRYPTION_KEY` y
`ENCRYPTION_KEY_VERSION` de la aplicación. Permiten descifrar las credenciales
de clientes que viven cifradas dentro de PostgreSQL; no forman parte de los 13
secrets del workflow de backup.

## 5. Inventario exacto de GitHub

### 5.1 Environment

- Repositorio: `https://github.com/onyxlink-AI/whatsapp-saas`
- Ruta: **Settings → Environments → `backup-production`**
- Debe exigir revisión antes de acceder a secretos de producción.
- No se debe permitir el bypass administrativo de esa protección.

### 5.2 Environment secrets

En `backup-production` deben existir exactamente estos 13 nombres:

| Secret | Origen del valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | PAT fino de Supabase con acceso a la organización/proyecto y `Database → Backups → Read` |
| `PRODUCTION_SUPABASE_PROJECT_REF` | Supabase producción; actualmente `uyrrunmqzdisplbdtabi` |
| `PRODUCTION_SUPABASE_DB_URL` | URI del Session Pooler de producción con contraseña percent-encoded |
| `PRODUCTION_SUPABASE_S3_ENDPOINT` | Supabase producción → Storage → Configuration → S3 |
| `PRODUCTION_SUPABASE_S3_REGION` | misma pantalla S3; actualmente `eu-central-1` |
| `PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID` | pareja S3 dedicada creada en Supabase producción |
| `PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY` | la misma pareja S3 dedicada |
| `R2_ENDPOINT` | endpoint de cuenta R2, sin el nombre del bucket al final |
| `R2_ACCESS_KEY_ID` | token R2 `onyxlink-backup-production-ci-v2` |
| `R2_SECRET_ACCESS_KEY` | el mismo token R2 |
| `R2_BUCKET` | `onyxlink-backups-production` |
| `RCLONE_CRYPT_PASSWORD` | primera clave `rclone obscure`, conservada en Bitwarden |
| `RCLONE_CRYPT_PASSWORD2` | segunda clave `rclone obscure`, conservada en Bitwarden |

Comprobar solo los nombres, nunca imprimir los valores:

```powershell
gh secret list --env backup-production --repo onyxlink-AI/whatsapp-saas
```

### 5.3 Variable de repositorio

La variable, no secret, debe existir a nivel de repositorio:

```text
BACKUP_ENABLED=false
```

Comprobación:

```powershell
gh variable list --repo onyxlink-AI/whatsapp-saas
```

`false` significa que ni el horario diario ni un clic accidental ejecutan una
copia. Solo se cambia temporalmente a `true` durante una ejecución real
expresamente autorizada, y se devuelve a `false` cuando el job entra en marcha.

## 6. Reconstrucción completa en 60–120 minutos

### Fase A — Código y herramientas (0–15 min)

1. Instalar Git, Node.js 24, Docker Desktop, GitHub CLI y WSL2/Ubuntu.
2. Clonar el repositorio oficial en una ruta corta:

   ```powershell
   New-Item -ItemType Directory -Force C:\ONYXLINK
   Set-Location C:\ONYXLINK
   git clone https://github.com/onyxlink-AI/whatsapp-saas.git
   Set-Location .\whatsapp-saas
   git checkout main
   git pull --ff-only origin main
   git status --short
   ```

3. Instalar dependencias reproducibles:

   ```powershell
   npm.cmd ci
   ```

**Resultado esperado:** rama `main`, estado limpio y presencia de
`.github/workflows/backup-production.yml` y `scripts/backup/`.

**Si falla:** no trabajar desde una carpeta local antigua ni copiar scripts a
mano. Recuperar primero el acceso a `onyxlink-AI/whatsapp-saas`.

### Fase B — PAT de Supabase (15–30 min)

1. Entrar en la cuenta y organización `onyxlink-AI` de Supabase.
2. Crear un PAT fino dedicado al backup si el de Bitwarden no es válido.
3. Seleccionar la organización correcta y conceder únicamente lo necesario;
   para el preflight debe incluir **Database → Backups → Read**.
4. Guardarlo en `ONYXLINK — Supabase CI Access Token` y actualizar
   `SUPABASE_ACCESS_TOKEN` en el Environment `backup-production`.
5. Probarlo una sola vez en PowerShell, sin mostrarlo:

   ```powershell
   $secureToken = Read-Host "Pega el PAT de Supabase" -AsSecureString
   $supabaseToken = ([System.Net.NetworkCredential]::new("", $secureToken).Password).Trim()
   $env:SUPABASE_ACCESS_TOKEN = $supabaseToken
   npx.cmd --yes supabase@2.111.0 backups list --project-ref uyrrunmqzdisplbdtabi
   Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
   Remove-Variable secureToken, supabaseToken -ErrorAction SilentlyContinue
   ```

**Resultado esperado:** lista de backups físicos con al menos uno en estado
`COMPLETED`.

**Si devuelve 401:** comprobar caducidad, organización, proyecto y permiso
Backups Read. Tras dos 401 idénticos, parar; no volver a rotar credenciales al
azar.

### Fase C — PostgreSQL de producción (30–45 min)

1. Abrir **Supabase → proyecto `onyxlink-AI` de producción**, nunca
   `onyxlink-staging`.
2. Abrir **Connect → Direct connection string** o **Session pooler**. Para
   GitHub Actions se usa Session Pooler por compatibilidad IPv4.
3. La URI tiene esta forma, sin guardar una contraseña literal en archivos:

   ```text
   postgresql://postgres.uyrrunmqzdisplbdtabi:[PASSWORD_PERCENT_ENCODED]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```

4. Usar la contraseña de base de datos vigente de Bitwarden. Solo hacer
   **Reset database password** si realmente se ha perdido; el reset puede romper
   conexiones existentes.
5. Percent-encode de la contraseña únicamente para insertarla en la URI.
6. Guardar la URI completa como `PRODUCTION_SUPABASE_DB_URL` en GitHub.
7. Validar con un dump pequeño y borrarlo al terminar:

   ```powershell
   $testDump = Join-Path $env:TEMP "onyxlink-roles-test.sql"
   $testLog = Join-Path $env:TEMP "onyxlink-roles-test.log"
   npx.cmd --yes supabase@2.111.0 db dump --db-url "$dbUrl" --file "$testDump" --role-only --log-level error *> $testLog
   "Dump correcto: $($LASTEXITCODE -eq 0)"
   Remove-Item -LiteralPath $testDump, $testLog -Force -ErrorAction SilentlyContinue
   ```

`$dbUrl` debe cargarse desde una entrada segura, no escribirse en el historial.

**Resultado esperado:** `Dump correcto: True` y un archivo no vacío antes de
eliminarlo.

**Si falla:** comprobar que no se usó el proyecto staging, que el secret no
quedó vacío y que la contraseña está percent-encoded en la URI.

### Fase D — S3 de Supabase Storage (45–55 min)

1. En el proyecto de producción abrir **Storage → Configuration → S3**.
2. Activar S3 si estuviera desactivado.
3. Crear una pareja dedicada de Access Key ID y Secret Access Key si la de
   Bitwarden ya no existe.
4. Guardar inmediatamente los cuatro datos:
   endpoint, región, Access Key ID y Secret Access Key.
5. Actualizar los cuatro secrets `PRODUCTION_SUPABASE_S3_*` de GitHub.

**Resultado esperado:** endpoint de producción y región `eu-central-1`.

**Si falla:** no usar la clave `service_role`; S3 tiene su propia pareja de
credenciales.

### Fase E — Cloudflare R2 (55–70 min)

1. Abrir **Cloudflare → R2 Object Storage**.
2. Confirmar el bucket `onyxlink-backups-production`:
   - privado;
   - jurisdicción EU;
   - sin dominio público, R2.dev, CORS ni acceso anónimo;
   - Bucket Lock activo para todo el bucket durante 30 días.
3. Confirmar el Account API token `onyxlink-backup-production-ci-v2`:
   - permiso **Object Read & Write**;
   - aplicado solo a `onyxlink-backups-production`;
   - sin filtro de IP, porque GitHub Actions usa direcciones dinámicas;
   - no caducado.
4. Si hay que recrearlo, guardar **Access Key ID** y **Secret Access Key**. No
   utilizar el campo `Token value`.
5. El endpoint correcto es la raíz de cuenta y no termina en el bucket:

   ```text
   https://2c2c30d2750129934364aa21026d963e.eu.r2.cloudflarestorage.com
   ```

6. Actualizar `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y
   `R2_BUCKET` en GitHub.

**Resultado esperado:** el token puede listar, leer y escribir objetos solo en
ese bucket, pero no modificar la configuración ni Bucket Lock.

**Si falla con 401:** endpoint o pareja de credenciales incorrectos. Las dos
claves deben proceder del mismo token.

### Fase F — Cifrado rclone (70–75 min)

1. Recuperar de Bitwarden, sin cambiarlas:
   `RCLONE_CRYPT_PASSWORD` y `RCLONE_CRYPT_PASSWORD2`.
2. Actualizar los dos secrets homónimos en GitHub.
3. Nunca escribirlos en `.env`, chat, documentos o logs.

**Resultado esperado:** las copias históricas continúan siendo legibles.

**Si se perdieron ambas claves:** detener la restauración. Los datos de R2
siguen cifrados y no existe un procedimiento para recuperarlos sin la pareja
original.

### Fase G — GitHub y preflight (75–90 min)

1. Confirmar los 13 nombres con `gh secret list`; no leer valores.
2. Confirmar `BACKUP_ENABLED=false`.
3. Ejecutar el workflow sintético Linux
   `.github/workflows/backup-test-only.yml`.
4. No usar Windows como veredicto del test de symlinks. El run Linux probado
   fue `32373528300` y terminó en verde.
5. No revivir el ensayo Docker personalizado
   `backup-restore-drill-fake.yml` como requisito de producción; quedó
   descartado por incompatibilidades propias de la imagen Supabase/Nix, no por
   un fallo del backup real.

**Resultado esperado:** prueba sintética verde, secrets completos y puerta
real cerrada.

### Fase H — Una copia real manual (90–120 min)

Esta fase lee producción y escribe únicamente una ruta nueva en R2. Requiere
autorización expresa y aprobación del Environment.

1. En GitHub **Settings → Secrets and variables → Actions → Variables**, cambiar
   temporalmente `BACKUP_ENABLED` a `true`.
2. Abrir **Actions → Copia externa cifrada de producción → Run workflow** y
   seleccionar `main`.
3. Aprobar el Environment `backup-production` en **Review deployments**.
4. Cuando el job ya esté `in_progress`, devolver inmediatamente
   `BACKUP_ENABLED` a `false`.
5. No cancelar el job salvo riesgo de seguridad.
6. Esperar estos pasos verdes:
   - preflight de backup físico Supabase;
   - creación del snapshot cifrado;
   - revalidación desde cero;
   - informe sin datos sensibles.

**Resultado esperado:** mensaje `Backup ... completado y verificado`, seguido
de `Snapshot ... legible, completo y con checksum válido`.

**Si falla después de escribir en R2:** no reintentar sobre el mismo identificador
de snapshot. Corregir la causa y dejar que la siguiente ejecución cree una ruta
nueva; `--immutable` protege contra sobrescrituras.

## 7. Verificación obligatoria de una copia

No declarar éxito hasta marcar todos los puntos:

- [ ] Workflow completo en verde.
- [ ] Ruta lógica válida `daily/AAAAMMDDTHHMMSSZ` o
      `monthly/AAAA-MM/AAAAMMDDTHHMMSSZ`.
- [ ] Marcador cifrado `COMPLETED` leído correctamente por `backup:verify`.
- [ ] `manifest.json` válido.
- [ ] `database.tar.gz` descargado de R2 y SHA-256 coincidente.
- [ ] El tar se puede listar.
- [ ] Recuento de objetos de Storage registrado.
- [ ] Cero artifacts de datos en GitHub.
- [ ] `BACKUP_ENABLED=false` al terminar.

Los nombres internos están cifrados. No es obligatorio ver literalmente
`COMPLETED` en la interfaz web de R2; la comprobación fiable es
`npm run backup:verify` usando las claves crypt originales.

## 8. Preparar un kit de restauración sin tocar bases de datos

Realizarlo en Linux o WSL, en un equipo aislado con espacio suficiente. Necesita
Node.js, rclone 1.75.0, tar, sha256sum, PostgreSQL 17 `pg_restore` y los secrets
de R2/crypt cargados solo en la sesión.

Ejemplo para la primera copia válida:

```bash
export BACKUP_SNAPSHOT_PATH='daily/20260821T082502Z'
export RESTORE_CONFIRMATION='PREPARE_LOCAL_RESTORE_KIT'
export RESTORE_ALLOWED_ROOT="$PWD/restore-work"
npm run backup:restore-kit
```

Para incluir los objetos de Storage:

```bash
export RESTORE_INCLUDE_STORAGE='true'
npm run backup:restore-kit
```

**Resultado esperado:** una carpeta nueva bajo `restore-work/` con:

```text
COMPLETED
manifest.json
database.tar.gz
database/roles.sql
database/schema.sql
database/data.sql
database/full-database.dump
storage/                 # solo si se solicitó
```

El script verifica checksum, archivos obligatorios y catálogo de
`full-database.dump`. No modifica ninguna base de datos.

## 9. Restauración real: siempre en un proyecto aislado

Nunca apuntar primero a `uyrrunmqzdisplbdtabi`.

1. Crear un proyecto Supabase nuevo, por ejemplo
   `onyxlink-restore-AAAAMMDD`, en la organización correcta.
2. No conectarlo todavía a Vercel ni a clientes.
3. Replicar extensiones, Webhooks y configuración necesarios.
4. Obtener la URI Session Pooler del proyecto nuevo y guardarla temporalmente
   como `RESTORE_TARGET_DB_URL`.
5. Desde la carpeta `database/` del kit ejecutar:

   ```bash
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "$RESTORE_TARGET_DB_URL"
   ```

6. Reactivar las publicaciones Realtime que correspondan.
7. Restaurar los objetos físicos de Storage en los buckets del proyecto nuevo,
   conservando exactamente bucket y ruta. La base solo contiene su metadata.
8. Configurar en el entorno aislado las claves originales de la aplicación
   `ENCRYPTION_KEY` y `ENCRYPTION_KEY_VERSION`.
9. Verificar antes de cualquier cambio de tráfico:
   - usuarios y login;
   - workspaces/clientes;
   - tablas y migraciones;
   - políticas RLS y aislamiento entre empresas;
   - objetos Storage y permisos;
   - credenciales cifradas de integraciones;
   - Dirección, Objetivos y KPI;
   - recordatorios y envíos reales cerrados.
10. Solo después de una revisión humana y una autorización separada se decide
    si se cambia Vercel al proyecto restaurado. La preparación del kit nunca
    autoriza el cambio de tráfico.

Los pasos de restore lógico siguen la guía oficial de Supabase. Si aparecen
errores de ownership de `supabase_admin` o grants de `cli_login_postgres`, usar
el troubleshooting de esa guía; no editar SQL a ciegas.

## 10. Los errores de las 48 horas y cómo evitarlos

| Síntoma real | Causa confirmada | Solución definitiva | Regla para el futuro |
|---|---|---|---|
| El PAT nuevo apareció en staging y `backup-production` seguía vacío | Se editó el Environment equivocado | El PAT de backup va en `backup-production` como `SUPABASE_ACCESS_TOKEN`; staging conserva su token independiente | Leer el encabezado del Environment antes de guardar |
| Secret creado con un nombre parecido pero no exacto | Se usó un nombre humano en lugar del nombre consumido por YAML | Usar exactamente los 13 nombres de la sección 5 | Un secret con otro nombre equivale a secret ausente |
| Dos ejecuciones devolvieron `401 Unauthorized` en `supabase backups list` | PAT caducados y después PAT sin permiso Backups Read | PAT fino nuevo, organización/proyecto correctos y `Database → Backups → Read`; probar primero una llamada local | Tras dos 401 idénticos, parar y diagnosticar |
| El CLI devolvía tabla legible, pero `jq` esperaba JSON | El workflow no solicitaba explícitamente JSON | PR #12: `supabase --output json backups list` y validación defensiva de la estructura | Nunca asumir el formato por defecto del CLI |
| `PRODUCTION_SUPABASE_DB_URL` fallaba o estaba vacío | Contraseña/URI incorrecta y una actualización por pipe de PowerShell guardó valor vacío | Session Pooler de producción, contraseña percent-encoded y carga por interfaz segura de GitHub | Validar no vacío y hacer un `--role-only` antes del backup completo |
| Se trabajó sobre staging al buscar la contraseña | Los dos proyectos estaban visibles y se mezclaron | Para backup usar siempre proyecto producción `onyxlink-AI`, ref `uyrrunmqzdisplbdtabi` | Mostrar nombre y ref antes de copiar cualquier valor |
| `pg_dump` avisó que versión 16 era anterior al servidor 17 | Runner Ubuntu instalaba PostgreSQL 16 | PR #13: dump forense con imagen oficial Supabase PostgreSQL 17.6 fijada por digest | Fijar la versión mayor del cliente al servidor |
| R2 devolvía 401 | Endpoint incluía el bucket o Access/Secret no pertenecían al mismo token | Endpoint raíz de cuenta y pareja del mismo Account API token | `Token value` nunca sustituye las claves S3 |
| R2 devolvía 501 y luego `immutable file modified` | `rclone 1.60.1` alcanzaba a escribir parcialmente y fallaba en una operación posterior | PR #14: `rclone v1.75.0` descargado con checksum fijado | Comprobar `rclone version` antes de escribir y usar ruta nueva tras un parcial |
| `npm run backup:test` fallaba solo en Windows en la prueba de symlink | Windows no podía crear el symlink real sin privilegio | Ejecutar el test sintético en `ubuntu-latest`; run verde `32373528300` | No convertir una limitación Windows en un fallo de seguridad inexistente |
| El ensayo Docker copió un `pg_dump` como symlink colgante | `docker cp` preservó el enlace interno | Se resolvió el path real, pero el ensayo reveló más incompatibilidades | No extraer binarios de esa imagen para ejecutarlos en el host |
| `supabase/postgres` terminó porque faltaba `supabase_admin` | `docker run` simple no reproduce la orquestación de `supabase start` | Se investigó y se cerró PR #9 sin fusionar | No usar la imagen Supabase aislada como simulador integral |
| `pg_isready: cannot execute: required file not found` | Binarios de la imagen construidos con Nix dependían de un intérprete inexistente en Ubuntu host | Abandonar el ensayo personalizado; usar pruebas sintéticas Linux y copia real controlada | No perder tiempo arreglando incompatibilidades del banco de pruebas una a una |
| Reintentos sobre snapshot parcial chocaban con inmutabilidad | `--immutable` detectaba objetos ya escritos | Nueva ejecución = nuevo snapshot ID | Nunca borrar ni sobrescribir para hacer pasar un workflow |

### Intentos que sirven como evidencia histórica

| Run/PR | Resultado útil |
|---|---|
| Run `32373528300` | `backup:test` sintético pasó completamente en Linux |
| Runs `32381543897`, `32383375075`, `32386053018`, `32387801775` | Confirmaron que el ensayo Docker personalizado no era una ruta rentable |
| Runs `32388964386`, `32390623216` | 401 de Supabase Management API; no tocaron datos ni R2 |
| PR #12 | Forzó salida JSON válida en el preflight |
| PR #13 | Fijó cliente PostgreSQL 17 para el dump forense |
| PR #14 | Fijó rclone 1.75.0 con checksum |
| Run `32463038193` | Primera copia real válida, cifrada y revalidada |

## 11. Qué no hacer

- No ejecutar `supabase db reset` contra un proyecto remoto.
- No restaurar primero sobre producción.
- No usar credenciales de staging en producción ni al revés.
- No usar `anon`, `service_role` o una contraseña DB como PAT de Management API.
- No utilizar el campo Cloudflare `Token value` como Access Key S3.
- No añadir el bucket al final de `R2_ENDPOINT`.
- No regenerar las claves crypt si se pretende leer copias históricas.
- No imprimir DSN, tokens o claves en logs, chat, documentos o Git.
- No subir dumps ni exportaciones de Bitwarden como artifacts.
- No considerar válido un snapshot sin `COMPLETED` y checksum correcto.
- No reintentar sobre una ruta inmutable parcialmente escrita.
- No activar permanentemente `BACKUP_ENABLED` sin una decisión nueva y una
  revisión del Environment; actualmente debe permanecer en `false`.

## 12. Mantenimiento y caducidades

| Frecuencia | Acción |
|---|---|
| Después de rotar una credencial | Actualizar Bitwarden y el secret exacto de GitHub; probar lectura antes de una copia completa |
| Semanal | Confirmar que la copia manual más reciente sigue verificable mientras la automatización esté desactivada |
| Mensual | Preparar un restore kit en entorno aislado y comprobar sus cuatro dumps |
| Trimestral | Restaurar en un proyecto Supabase aislado y validar RLS, Auth y Storage |
| Antes del 19/08/2027 | Rotar `onyxlink-backup-production-ci-v2` o ampliar su estrategia de caducidad |
| Tras cambios importantes | Crear una nueva copia externa y una copia fechada del repositorio en disco externo |

La copia fechada del código verificada durante este trabajo quedó en:

```text
D:\DATOS Y RECURSOS ONYXLINK\ONYXLINK VERSION OFICIAL\ONYXLINK\APPS\whatsapp-saas-2026-08-20
```

Corresponde al SHA `c058318f68b0b222ea9374cf3640354ccfde34ab`. No
sustituye a GitHub ni al backup de datos de R2.

## 13. Checklist de recuperación en emergencia

- [ ] Determinar si solo se perdió el ordenador o también Supabase.
- [ ] Si producción está online, no restaurar nada; recuperar únicamente accesos y código.
- [ ] Clonar `main` desde GitHub.
- [ ] Recuperar los dos elementos confirmados de Bitwarden.
- [ ] Localizar los 13 campos obligatorios y las claves de aplicación.
- [ ] Verificar PAT de Supabase con una sola llamada de lectura.
- [ ] Verificar URI DB con dump `--role-only`.
- [ ] Confirmar credenciales S3 de Supabase producción.
- [ ] Confirmar bucket, lock, endpoint y token R2 v2.
- [ ] Confirmar los 13 secrets de `backup-production` por nombre.
- [ ] Confirmar `BACKUP_ENABLED=false`.
- [ ] Ejecutar `backup:test` en Linux.
- [ ] Ejecutar una copia real manual solo si fue autorizada.
- [ ] Confirmar `COMPLETED`, checksum y `backup:verify`.
- [ ] Preparar restore kit.
- [ ] Restaurar únicamente en proyecto aislado.
- [ ] Verificar RLS, Auth, Storage, integraciones y claves de cifrado.
- [ ] Documentar run, SHA, snapshot y resultado sin secretos.

## 14. Escalación

| Situación | Acción |
|---|---|
| Dos 401 idénticos de Supabase | Parar y revisar PAT/permisos; después Supabase Support con run IDs y timestamps |
| Credencial expuesta | Revocar, rotar, revisar logs y actualizar Bitwarden/GitHub |
| Claves crypt perdidas | No tocar R2; buscar exportaciones cifradas y escalar al responsable de seguridad |
| Snapshot sin `COMPLETED` | Tratarlo como fallido; nunca restaurar desde él |
| Corrupción o borrado en producción | Congelar despliegues; preservar logs; preparar proyecto aislado y abrir soporte |
| Duda sobre destino de restauración | No ejecutar `psql`; confirmar por nombre y project ref que es el proyecto aislado |

## 15. Referencias oficiales

- [Supabase: Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase: descargar objetos de Storage](https://supabase.com/docs/guides/storage/management/download-objects)
- Implementación versionada de OnyxLink:
  `.github/workflows/backup-production.yml` y `scripts/backup/`.

Las referencias oficiales prevalecen si Supabase modifica en el futuro los
comandos de restauración. Antes de una restauración real hay que contrastar de
nuevo la versión de CLI y la versión mayor de PostgreSQL.

## 16. Historial

| Fecha | Responsable | Nota |
|---|---|---|
| 21/08/2026 | Codex / OnyxLink | Runbook maestro creado tras la primera copia externa válida; consolida inventario, reconstrucción, restauración y todos los fallos confirmados. |

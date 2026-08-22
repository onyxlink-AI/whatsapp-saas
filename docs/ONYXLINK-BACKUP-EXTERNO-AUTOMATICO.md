# Backup externo automático de OnyxLink

**Estado (21/08/2026):** implementado, probado con una copia real de producción
y verificado — run `32463038193`, snapshot `daily/20260821T082502Z`, marcador
`COMPLETED`, checksum correcto y revalidación desde cero correcta. La
automatización diaria sigue **desactivada a propósito**: `BACKUP_ENABLED`
permanece en `false` hasta una decisión nueva y una revisión del Environment.
Para el detalle completo de la reconstrucción, inventario de secrets y
restauración, ver `docs/ONYXLINK-RECUPERACION-MAESTRA-BACKUP-R2.md`, que
prevalece sobre este documento en caso de contradicción.

## 1. Qué problema resuelve

Supabase Pro conserva siete copias diarias de PostgreSQL, pero esas copias no
contienen los objetos reales de Supabase Storage. Además, al eliminar un
proyecto también desaparecen sus backups internos. Este sistema crea una copia
independiente, cifrada y almacenada fuera de Supabase.

Protege:

- roles, esquema y datos mediante los tres dumps lógicos recomendados por
  Supabase;
- un dump forense adicional de PostgreSQL;
- todos los buckets y objetos accesibles por el endpoint S3 de Supabase;
- un manifiesto, checksum SHA-256 y marcador `COMPLETED` por snapshot.

No contiene variables de Vercel, exportaciones de Bitwarden ni secretos que no
formen parte de la base de datos. `ENCRYPTION_KEY` y sus versiones deben seguir
custodiándose por separado en Bitwarden: sin ellas, las credenciales de cliente
restauradas continuarían cifradas pero no serían utilizables.

## 2. Garantías técnicas

- El workflow está cerrado mientras `BACKUP_ENABLED` no sea `true`.
- Cada ejecución usa una ruta nueva y `rclone --immutable`.
- El proceso nunca ejecuta una eliminación remota.
- Contenido, nombres de archivo y nombres de carpeta se cifran con `rclone
  crypt` antes de enviarse a R2.
- El marcador `COMPLETED` se escribe al final. Su ausencia identifica un intento
  incompleto que nunca debe restaurarse.
- La base de datos subida se descarga de nuevo, se compara por SHA-256 y se
  abre como archivo tar antes de declarar éxito.
- Storage se compara objeto por objeto y tamaño contra el origen.
- Los temporales se crean con `umask 077` y se eliminan al salir.
- GitHub no recibe artifacts con datos de clientes.

## 3. Retención e inmutabilidad en R2

Los días 1 se guardan bajo `monthly/YYYY-MM/`; el resto bajo `daily/`. En el
bucket privado `onyxlink-backups-production` configurar:

| Prefijo físico | Retención mínima | Objetivo |
|---|---:|---|
| snapshots diarios | 35 días | Mantener al menos 30 copias diarias |
| snapshots mensuales | 400 días | Mantener al menos 12 copias mensuales |

El sistema utiliza dos raíces crypt independientes. R2 solo ve los prefijos
`onyxlink-production/daily/` y `onyxlink-production/monthly/`; los IDs de
snapshot, nombres interiores y contenido continúan cifrados. Configurar dos
reglas de Bucket Lock: 35 días para la raíz diaria y 400 días para la mensual.
Configurar después lifecycle de eliminación a 40 y 410 días respectivamente.
El bloqueo siempre debe durar menos que la eliminación programada.

No habilitar dominio público, R2.dev, CORS ni acceso anónimo.

## 4. Crear el bucket de Cloudflare R2

1. Cloudflare → R2 Object Storage → Create bucket.
2. Nombre: `onyxlink-backups-production`.
3. Mantener el bucket privado.
4. Settings → Bucket Lock Rules → regla para todo el bucket de 400 días.
5. Crear un token S3 limitado únicamente a ese bucket con lectura y escritura.
6. Guardar Access Key ID, Secret Access Key y endpoint S3 en Bitwarden.

El token no necesita administrar DNS, Workers, cuentas ni otros buckets.

## 5. Credenciales S3 de Supabase Storage

En Supabase producción → Storage → Configuration → S3:

1. Habilitar el protocolo S3.
2. Crear una pareja de credenciales dedicada exclusivamente al backup.
3. Guardar endpoint, región, Access Key ID y Secret Access Key en Bitwarden.
4. No reutilizar `service_role` ni una credencial de aplicación.

## 6. Claves de cifrado de rclone

En una terminal segura con rclone instalado, generar dos valores diferentes:

```bash
rclone obscure "$(openssl rand -base64 48)"
rclone obscure "$(openssl rand -base64 48)"
```

Guardar las salidas como:

- `RCLONE_CRYPT_PASSWORD`;
- `RCLONE_CRYPT_PASSWORD2`.

Ambas son imprescindibles para descifrar nombres y contenido. Guardarlas en
Bitwarden y en una exportación cifrada externa. Nunca regenerarlas sobre un
repositorio existente: una clave distinta hace que las copias anteriores no
sean legibles.

## 7. GitHub Environment `backup-production`

Crear el Environment sin deployment automático y cargar:

- `SUPABASE_ACCESS_TOKEN`
- `PRODUCTION_SUPABASE_PROJECT_REF`
- `PRODUCTION_SUPABASE_DB_URL` (URL PostgreSQL percent-encoded)
- `PRODUCTION_SUPABASE_S3_ENDPOINT`
- `PRODUCTION_SUPABASE_S3_REGION`
- `PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID`
- `PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `RCLONE_CRYPT_PASSWORD`
- `RCLONE_CRYPT_PASSWORD2`

Los secretos se copian desde Bitwarden directamente a GitHub. Nunca se pegan en
chat, `.env`, archivos del proyecto o logs.

Crear la variable de repositorio `BACKUP_ENABLED=false`.

## 8. Activación segura

1. Ejecutar `npm run backup:test` localmente.
2. Probar el workflow contra un Supabase y bucket R2 ficticios.
3. Ejecutarlo manualmente una vez con producción, con autorización explícita.
4. Preparar un restore kit del snapshot y comprobar sus cuatro dumps.
5. Realizar una restauración supervisada en un proyecto Supabase aislado.
6. Confirmar alertas de GitHub Actions.
7. Solo entonces cambiar `BACKUP_ENABLED=true`.

El horario programado es 02:20 UTC. El ordenador puede permanecer apagado.

## 9. Recuperación

Para descargar y validar un kit sin tocar ninguna base de datos:

```bash
BACKUP_SNAPSHOT_PATH=daily/AAAAMMDDTHHMMSSZ \
RESTORE_CONFIRMATION=PREPARE_LOCAL_RESTORE_KIT \
npm run backup:restore-kit
```

`RESTORE_OUTPUT_DIR`, si se personaliza, debe permanecer dentro de
`RESTORE_ALLOWED_ROOT`. Las rutas se canonizan antes de crear o limpiar nada,
incluidos los enlaces simbólicos de directorios padre.

Por defecto no descarga Storage. Añadir `RESTORE_INCLUDE_STORAGE=true` solo en
un entorno aislado con espacio suficiente.

El script deliberadamente **no restaura automáticamente sobre producción**.
Una restauración real requiere proyecto aislado, revisión del manifiesto,
claves originales de cifrado de OnyxLink y autorización expresa. Este límite
evita que una automatización de backup pueda destruir datos vivos.

## 10. Coste y escalabilidad

Esta primera versión guarda snapshots completos de Storage. Es la opción más
simple y recuperable para los primeros clientes, pero el consumo crece según:

`tamaño de Storage × número de snapshots conservados`.

Revisar mensualmente el tamaño indicado en el manifiesto. Antes de superar 20
GB de Storage activo, migrar el almacenamiento de copias a una estrategia
deduplicada o separar diarios/mensuales con políticas independientes. No esperar
a alcanzar el límite para diseñar esa migración.

## 11. Alertas y auditoría

- Activar notificaciones de GitHub Actions para workflows fallidos.
- Un workflow rojo equivale a “sin copia confirmada”; nunca asumir éxito.
- Revisar semanalmente que existe un `COMPLETED` reciente.
- Realizar mensualmente un restore kit.
- Hacer trimestralmente una restauración completa en un Supabase aislado.
- Rotar credenciales S3 sin cambiar las dos claves crypt.

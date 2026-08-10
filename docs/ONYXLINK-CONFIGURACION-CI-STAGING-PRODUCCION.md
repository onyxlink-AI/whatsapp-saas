# Configuración del pipeline local → staging → producción

Este documento configura una sola vez la infraestructura descrita en
`ONYXLINK-PROTOCOLO-ACTUALIZACIONES-SIN-DOWNTIME.md`.

## 1. Qué queda automatizado

- Cada pull request y cada push a `main`: Supabase local efímero, migraciones
  desde cero, preflight de Board, typecheck, lint, tests y build.
- Cada martes: preparación de staging si `STAGING_ENABLED=true`.
- Producción: workflow manual, SHA exacto, palabra `PUBLICAR` y aprobación del
  Environment `production`.
- Las pruebas nunca reciben credenciales de producción; siempre usan Docker.
- Producción solo se consulta para backup/preflight y recibe migraciones después
  de superar todas las barreras.

## 2. Crear Supabase de staging

Crear un proyecto separado del proyecto de producción. Reglas:

- Nombre sugerido: `onyxlink-staging`.
- Región igual o próxima a producción.
- Nunca copiar clientes reales.
- Usar únicamente usuarios, workspaces, archivos e integraciones ficticios.
- OpenRouter/Vapi/Meta deben usar cuentas de prueba o permanecer desconectados.
- Aplicar las migraciones versionadas del repositorio, no SQL manual.

Después guardar en Bitwarden, sin pegarlos en documentación:

- project ref;
- URL;
- anon key;
- service role key;
- contraseña de base de datos.

## 3. Configurar Vercel Preview/Staging

En el proyecto `whatsapp-saas`, configurar para el entorno **Preview**:

- `NEXT_PUBLIC_SUPABASE_URL`: URL del Supabase de staging.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon key de staging.
- `SUPABASE_SERVICE_ROLE_KEY`: service role de staging.
- `ENCRYPTION_KEY` y `ENCRYPTION_KEY_VERSION`: exclusivos de staging.
- `NEXT_PUBLIC_APP_URL`: dominio de staging cuando sea estable.
- El resto de integraciones: valores de prueba o desactivados.

Nunca reutilizar en staging una credencial real de cliente.

Opcionalmente crear `staging.onyxlinkpanel.com` y asignarlo al deployment de
staging estable. Los previews temporales seguirán teniendo URL propia.

## 4. GitHub Environments

En GitHub → Settings → Environments:

### `staging`

Crear secrets:

- `STAGING_SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `STAGING_SUPABASE_DB_PASSWORD`
- `STAGING_ENCRYPTION_KEY`
- `STAGING_ENCRYPTION_KEY_VERSION`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Crear la variable de repositorio:

- `STAGING_ENABLED=false` mientras no exista el proyecto.
- Cambiarla a `true` únicamente después de probar manualmente el workflow.

### `production`

Configurar al menos un **required reviewer**. Ningún workflow debe poder
autoaprobarse.

Crear secrets:

- `PRODUCTION_SUPABASE_PROJECT_REF`
- `PRODUCTION_SUPABASE_URL`
- `PRODUCTION_SUPABASE_ANON_KEY`
- `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`
- `PRODUCTION_SUPABASE_DB_PASSWORD`
- `PRODUCTION_ENCRYPTION_KEY`
- `PRODUCTION_ENCRYPTION_KEY_VERSION`
- `SUPABASE_ACCESS_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Los valores se copian desde Bitwarden directamente a GitHub; nunca pasan por
chat, archivos temporales o commits.

## 5. Protección de `main`

En GitHub → Settings → Branches/Rulesets:

- Requerir pull request para cambios normales.
- Requerir el check `Typecheck, lint, tests y build`.
- Exigir rama actualizada antes de fusionar.
- Bloquear force-push y borrado de `main`.
- Mantener bypass únicamente para una emergencia documentada del propietario.
- No exigir auto-deploy a producción al hacer merge.

## 6. Primera prueba de staging

1. Mantener `STAGING_ENABLED=false`.
2. Abrir Actions → `Preparar staging semanal`.
3. Ejecutarlo manualmente con `ref=main` después de cargar los secrets.
4. Verificar migraciones, URL, login y datos ficticios.
5. Hacer smoke test con dos workspaces ficticios.
6. Cambiar `STAGING_ENABLED=true`.

Desde entonces GitHub preparará staging los martes aunque el ordenador esté
apagado.

## 7. Publicar una versión

1. Confirmar CI verde.
2. Confirmar staging y smoke test.
3. Copiar el SHA completo de `origin/main`.
4. Actions → `Publicar producción con aprobación`.
5. Introducir el SHA y `PUBLICAR`.
6. Aprobar el Environment `production` cuando GitHub lo solicite.
7. Vigilar logs y hacer smoke test autenticado durante 15 minutos.

El workflow se detiene si:

- el SHA no es exactamente el HEAD de `main`;
- falta la confirmación literal;
- no existe backup físico completado;
- falla Board;
- falla cualquier prueba/build;
- falla una migración;
- Vercel no termina correctamente;
- el health check público falla.

## 8. Lo que sigue siendo humano

- Aprobar el alcance y la experiencia visual.
- Aprobar el Environment de producción.
- Smoke test con sesión interna real.
- Decidir la activación progresiva de feature flags.
- Evaluar cualquier migración que transforme o elimine datos.
- Confirmar la copia independiente de Storage.

## 9. Emergencia

- Apagar primero la feature flag afectada.
- Promocionar el último deployment estable de Vercel.
- No revertir SQL a mano.
- Conservar logs y abrir una migración correctiva.
- Comunicar a clientes solo si existe impacto real, con alcance y resolución.

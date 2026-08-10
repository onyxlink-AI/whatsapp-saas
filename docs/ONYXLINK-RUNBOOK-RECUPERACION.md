# Runbook: Recuperar OnyxLink en otro ordenador

**Propietario:** NexorLabs / OnyxLink
**Frecuencia:** Cuando se sustituya, pierda o averíe el ordenador de desarrollo
**Última actualización:** 30 de julio de 2026
**Versión de producción verificada al actualizarlo:** `8a91c6b0cd6806e7f997ba44887ce13104382eec`

## 1. Objetivo

Este manual permite recuperar el entorno de trabajo de OnyxLink en un ordenador
nuevo sin interrumpir la producción.

La aplicación oficial no depende del ordenador:

- **GitHub** conserva el código.
- **Vercel** mantiene la aplicación publicada.
- **Supabase** mantiene autenticación, base de datos y datos de producción.
- El ordenador solo contiene una copia de trabajo y el Supabase local de pruebas.

> **Regla crítica:** nunca ejecutes `supabase db reset` ni cargues
> `supabase/seed.sql` contra el proyecto remoto de producción. `db reset` se usa
> exclusivamente con el Supabase local de Docker.

## 2. Sistemas oficiales

| Sistema | Identificador |
|---|---|
| Aplicación | `https://onyxlinkpanel.com` |
| GitHub | `https://github.com/onyxlink-AI/whatsapp-saas.git` |
| Rama oficial | `main` |
| Vercel | equipo `onyxlink`, proyecto `whatsapp-saas` |
| Supabase remoto | proyecto `uyrrunmqzdisplbdtabi` |
| Supabase local | API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323` |

## 3. Qué debe estar guardado antes de una emergencia

La copia externa automática de base de datos y Storage se configura y verifica
según `docs/ONYXLINK-BACKUP-EXTERNO-AUTOMATICO.md`. El disco externo ya no es la
única copia independiente de los datos de cliente.

Guardar en un gestor de contraseñas empresarial, nunca en GitHub, correo sin
cifrar ni este documento:

- [ ] Acceso y códigos de recuperación 2FA de GitHub.
- [ ] Acceso y códigos de recuperación 2FA de Vercel.
- [ ] Acceso y códigos de recuperación 2FA de Supabase.
- [ ] Contraseña de la base de datos de Supabase.
- [ ] Token de acceso de Supabase Management API.
- [ ] Acceso al dominio `onyxlinkpanel.com` y su DNS.
- [ ] Acceso a OpenRouter, Vapi, Google Cloud y YCloud.
- [ ] Una copia cifrada de las variables de producción.
- [ ] Copias externas de la base de datos y, si se usa, Supabase Storage.

La variable más importante para recuperar las integraciones existentes es
`ENCRYPTION_KEY`. Las credenciales de cada cliente están cifradas con ella.
Restaurar la base de datos con una clave diferente impediría descifrarlas.
También debe conservarse `ENCRYPTION_KEY_VERSION`.

## 4. Prerrequisitos del ordenador nuevo

### 4.1 Instalar WSL2

Abrir PowerShell como administrador:

```powershell
wsl --install
wsl --update
```

Reiniciar Windows si lo solicita.

**Resultado esperado:** `wsl --version` muestra una versión instalada.

**Si falla:** comprobar que la virtualización está habilitada en BIOS/UEFI y que
Windows está actualizado.

### 4.2 Instalar herramientas

Instalar:

1. Git para Windows: `https://git-scm.com/download/win`
2. Node.js 24 LTS: `https://nodejs.org/`
3. Docker Desktop con motor WSL2:
   `https://docs.docker.com/desktop/setup/install/windows-install/`
4. Un editor, preferiblemente VS Code.

Abrir Docker Desktop y esperar a que indique que está funcionando.

Comprobar:

```powershell
git --version
node --version
npm.cmd --version
docker version
wsl --version
```

**Versiones mínimas del proyecto:**

- Node.js 20 o superior; se recomienda Node.js 24 LTS.
- Next.js 16.
- React 19.

> En algunos Windows, PowerShell bloquea `npm.ps1`, `npx.ps1` o `vercel.ps1`.
> Usa `npm.cmd`, `npx.cmd` y `vercel.cmd`; no es necesario cambiar la política de
> ejecución.

## 5. Recuperar el código desde GitHub

Elegir una ubicación local que no sea una carpeta temporal:

```powershell
New-Item -ItemType Directory -Force C:\ONYXLINK
Set-Location C:\ONYXLINK
git clone https://github.com/onyxlink-AI/whatsapp-saas.git
Set-Location .\whatsapp-saas
git checkout main
git pull --ff-only origin main
```

Comprobar:

```powershell
git remote -v
git branch --show-current
git status --short
git rev-parse HEAD
```

**Resultado esperado:**

- `origin` apunta a `onyxlink-AI/whatsapp-saas`.
- La rama es `main`.
- `git status --short` no devuelve nada.
- El commit debe ser el último de GitHub. La versión verificada el 30/07/2026
  era `8a91c6b0cd6806e7f997ba44887ce13104382eec`.

**Si GitHub deniega el acceso:** iniciar sesión con la cuenta autorizada en la
organización `onyxlink-AI` y revisar el segundo factor.

## 6. Instalar dependencias

Desde la raíz del repositorio:

```powershell
npm.cmd ci
```

Usar `npm ci`, no `npm install`, para respetar exactamente `package-lock.json`.

**Resultado esperado:** termina sin errores y crea `node_modules`.

**Si falla:**

```powershell
node --version
npm.cmd cache verify
```

Comprobar la conexión y volver a ejecutar `npm.cmd ci`. No borrar ni modificar
el lockfile para solucionar el problema.

## 7. Reconstruir el entorno local de pruebas

### 7.1 Arrancar Supabase local

Con Docker Desktop abierto:

```powershell
npx.cmd supabase start
npx.cmd supabase status
```

La primera ejecución descarga las imágenes de Docker y puede tardar.

**Resultado esperado:**

- API local: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`

**Si falla:** confirmar que Docker Desktop está en modo de contenedores Linux y
que `docker version` muestra tanto Client como Server.

### 7.2 Aplicar migraciones y datos de prueba

```powershell
npx.cmd supabase db reset
```

Este comando aplica las **51 migraciones versionadas** y después
`supabase/seed.sql`.

**Resultado esperado:** finaliza indicando que la base local fue reiniciada y
sembrada.

Credenciales locales reproducibles:

| Rol local | Usuario | Contraseña |
|---|---|---|
| Superadministrador | `superadmin@onyxlink.local` | `TestLocal123!` |
| Cliente Empresa A | `cliente@empresaa.local` | `TestLocal123!` |

Estas cuentas son únicamente fixtures de desarrollo y no son credenciales de
producción.

### 7.3 Crear `.env.local`

Primero obtener las claves del Supabase local:

```powershell
npx.cmd supabase status -o env
Copy-Item .env.local.example .env.local
notepad .env.local
```

Completar como mínimo:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY mostrada por supabase status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY mostrada por supabase status>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
OPENROUTER_DEFAULT_MODEL=openai/gpt-4o-mini
```

Generar secretos **solo para el entorno local nuevo**:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Usar la primera salida como `ENCRYPTION_KEY`. Generar salidas independientes de
32 bytes para:

- `BUFFER_PROCESS_SECRET`
- `CRON_SECRET`
- `VAPI_WEBHOOK_SECRET`

Establecer `ENCRYPTION_KEY_VERSION=v1`.

> No copies credenciales reales de clientes al entorno local. Si alguna prueba
> exige datos cifrados restaurados desde producción, utiliza una copia aislada y
> recupera la `ENCRYPTION_KEY` original desde el gestor de secretos.

Variables reconocidas por OnyxLink:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
NODE_ENV
OPENROUTER_API_KEY
OPENROUTER_DEFAULT_MODEL
ENCRYPTION_KEY
ENCRYPTION_KEY_VERSION
BUFFER_PROCESS_SECRET
CRON_SECRET
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
VAPI_WEBHOOK_SECRET
VAPI_API_KEY
REMINDERS_LIVE_SENDING_ENABLED
REMINDERS_TEST_PHONE_ALLOWLIST
```

Las credenciales de YCloud, HighLevel y otras integraciones por cliente no son
variables globales: viven cifradas por empresa en Supabase.

Mantener ausentes estas dos variables durante la recuperación local:

```dotenv
# REMINDERS_LIVE_SENDING_ENABLED=true
# REMINDERS_TEST_PHONE_ALLOWLIST=...
```

Así los recordatorios reales permanecen cerrados por defecto.

## 8. Levantar OnyxLink localmente

```powershell
npm.cmd run dev
```

Abrir:

- Aplicación: `http://localhost:3000`
- Supabase Studio: `http://127.0.0.1:54323`

**Resultado esperado:** aparece el inicio de sesión de OnyxLink y es posible
entrar con las cuentas locales del paso anterior.

Para detener Next.js: `Ctrl+C`.

Para detener Supabase local cuando ya no se necesite:

```powershell
npx.cmd supabase stop
```

## 9. Validación obligatoria

Con Supabase local funcionando:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Lista de comprobación visual:

- [ ] El superadministrador inicia sesión y llega a `/workspaces`.
- [ ] El cliente inicia sesión y solo ve su propia empresa.
- [ ] Oficina Virtual carga sin errores.
- [ ] “Presentación” solo aparece al superadministrador.
- [ ] Un WhatsApp no configurado no aparece en la oficina.
- [ ] El Chatbot solo es accesible para el superadministrador.
- [ ] No aparecen errores rojos en la consola del navegador.

No se considera recuperado el entorno hasta completar esta sección.

## 10. Volver a enlazar las herramientas de producción

Esta sección no modifica producción; solo recupera el acceso administrativo
desde el nuevo ordenador.

### 10.1 Vercel

```powershell
npm.cmd install --global vercel
vercel.cmd login
vercel.cmd link
```

Al responder los asistentes, elegir:

- Equipo: `onyxlink`
- Proyecto existente: `whatsapp-saas`

Comprobar:

```powershell
vercel.cmd inspect onyxlinkpanel.com
vercel.cmd logs onyxlinkpanel.com --level error --since 1h
```

Para descargar la configuración de producción a la caché local de Vercel:

```powershell
vercel.cmd pull --environment=production
```

No imprimir, enviar por chat ni commitear los archivos descargados en `.vercel`.

### 10.2 Supabase remoto

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref uyrrunmqzdisplbdtabi
npx.cmd supabase migration list
```

`migration list` es una comprobación de lectura.

> Después de enlazar el proyecto remoto, sigue estando prohibido ejecutar
> `supabase db reset`. Para aplicar nuevas migraciones revisadas se utiliza
> `supabase db push`, y solo durante un despliegue autorizado.

### 10.3 Comprobación pública sin iniciar sesión

```powershell
curl.exe -sS -o NUL -w "%{http_code}" https://onyxlinkpanel.com/login
curl.exe -sS -o NUL -w "%{http_code}" https://onyxlinkpanel.com/oficina-virtual
```

**Resultado esperado:**

- `/login`: `200`
- `/oficina-virtual` sin sesión: `307` hacia el login

## 11. Si producción sigue online

Si solo se rompió el ordenador, no hay que restaurar ni desplegar nada. Tras
completar los pasos 4–10, el trabajo puede continuar normalmente.

No ejecutar un despliegue “para probar”. Vercel y Supabase ya están operativos
en la nube.

## 12. Si fuera necesario volver a desplegar

Solo después de validar localmente y confirmar que la rama `main` está limpia:

```powershell
git checkout main
git pull --ff-only origin main
git status --short
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
vercel.cmd --prod
```

Después:

```powershell
curl.exe -sS -o NUL -w "%{http_code}" https://onyxlinkpanel.com/login
vercel.cmd logs onyxlinkpanel.com --level error --since 10m
```

No desplegar si:

- `git status --short` muestra cambios desconocidos.
- Falla TypeScript, lint, pruebas o build.
- Falta alguna variable de producción.
- La base de datos no tiene aplicadas las migraciones esperadas.

## 13. Restaurar datos de producción

Esta sección solo se usa si también existe una pérdida o corrupción real en
Supabase. La rotura del ordenador no la requiere.

Orden preferido:

1. Abrir Supabase Dashboard → proyecto de producción → **Database → Backups**.
2. Seleccionar una copia anterior al incidente.
3. Revisar la hora y el impacto antes de restaurar.
4. Restaurar desde el Dashboard o crear un proyecto nuevo desde la copia.
5. Verificar usuarios, empresas, conversaciones, integraciones y RLS.
6. Confirmar las variables de Vercel antes de cambiar la aplicación al proyecto
   restaurado.

Para una copia lógica externa, Supabase recomienda separar roles, esquema y
datos:

```powershell
npx.cmd supabase db dump --db-url "<CONNECTION_STRING>" -f roles.sql --role-only
npx.cmd supabase db dump --db-url "<CONNECTION_STRING>" -f schema.sql
npx.cmd supabase db dump --db-url "<CONNECTION_STRING>" -f data.sql --use-copy --data-only
```

No introducir la cadena de conexión en el historial del terminal compartido ni
en el chat. Guardar `roles.sql`, `schema.sql` y `data.sql` cifrados fuera del
ordenador.

Supabase Database Backups no incluye automáticamente los objetos físicos de
Storage. Si OnyxLink empieza a almacenar archivos de clientes en Storage, debe
existir una copia independiente de esos objetos.

## 14. Protocolo obligatorio después de cualquier trabajo

Toda persona o asistente que trabaje en OnyxLink debe seguir
[`ONYXLINK-PROTOCOLO-CIERRE.md`](./ONYXLINK-PROTOCOLO-CIERRE.md) antes de dar la
tarea por terminada. Ese protocolo obliga a validar el cambio, actualizar GitHub,
proteger producción y Supabase, y mantener las copias de disco externo y
Bitwarden que correspondan.

## 15. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `npm.ps1 cannot be loaded` | Política de PowerShell | Usar `npm.cmd`, `npx.cmd` o `vercel.cmd`. |
| Docker no responde | Docker Desktop cerrado o WSL2 detenido | Abrir Docker Desktop, ejecutar `wsl --update` y reiniciar Docker. |
| `supabase start` falla por puertos | Otro Supabase local sigue activo | Ejecutar `npx.cmd supabase stop` en el proyecto anterior o revisar los puertos ocupados. |
| El login local dice contraseña incorrecta | Seed no aplicado o auth local inconsistente | Ejecutar únicamente en local `npx.cmd supabase db reset`. |
| Faltan tablas o RPC | Migraciones locales no aplicadas | Ejecutar únicamente en local `npx.cmd supabase db reset`. |
| Las integraciones restauradas no se descifran | `ENCRYPTION_KEY` incorrecta | Recuperar exactamente la clave y versión originales; no generar otra. |
| La app local intenta usar datos reales | `.env.local` apunta a Supabase remoto | Detener la app y sustituir URL/claves por las de `127.0.0.1:54321`. |
| Vercel no encuentra el proyecto | Cuenta/equipo equivocado | Cambiar al equipo `onyxlink` y volver a ejecutar `vercel.cmd link`. |
| Producción devuelve 500 tras desplegar | Variables o migraciones incompletas | Revisar logs de Vercel, no tocar datos, y volver al despliegue estable anterior. |
| WhatsApp recibe pero no responde | Agente detenido, integración o cron | Revisar panel, activación desde Oficina, YCloud y ejecuciones del cron. |

## 16. Rollback de un despliegue defectuoso

Si una versión nueva falla pero la base de datos sigue sana:

1. No ejecutar nuevas migraciones ni modificar datos.
2. Abrir Vercel → `whatsapp-saas` → Deployments.
3. Elegir el último despliegue estable.
4. Usar **Promote to Production**.
5. Verificar `/login`, autenticación, Inbox y Oficina Virtual.
6. Revisar los logs durante al menos diez minutos.

Si la migración ya cambió datos o estructura, no improvisar un SQL inverso.
Restaurar desde la copia previa o crear una migración correctiva revisada.

## 17. Escalación

| Situación | Responsable |
|---|---|
| Sin acceso a GitHub/Vercel/Supabase | Propietario de las cuentas OnyxLink y recuperación 2FA |
| Fallo de despliegue sin pérdida de datos | Responsable técnico de OnyxLink |
| Corrupción, borrado o fuga de datos | Detener cambios y escalar inmediatamente a Supabase Support y al responsable de seguridad |
| Pérdida de dominio o DNS | Registrador del dominio y Vercel Support |
| Credencial expuesta | Revocarla, rotarla, actualizar Vercel y revisar logs |

## 18. Cierre de la recuperación

- [ ] Código clonado desde `onyxlink-AI/whatsapp-saas`.
- [ ] Rama `main` limpia y actualizada.
- [ ] Docker y Supabase local funcionando.
- [ ] Las 51 migraciones y el seed se aplican desde cero.
- [ ] `.env.local` usa exclusivamente Supabase local.
- [ ] TypeScript, lint, pruebas y build pasan.
- [ ] Accesos por rol comprobados.
- [ ] Vercel y Supabase remoto enlazados sin modificar producción.
- [ ] Producción continúa respondiendo correctamente.
- [ ] Ningún secreto se imprimió, compartió ni añadió a Git.

## 19. Historial

| Fecha | Responsable | Nota |
|---|---|---|
| 29/07/2026 | Codex / OnyxLink | Primera versión basada en el candidato de producción `7c6d487`. |
| 30/07/2026 | Codex / OnyxLink | Añadido el protocolo permanente de cierre, GitHub, producción, Supabase, copia externa y Bitwarden. Versión verificada `8a91c6b`. |

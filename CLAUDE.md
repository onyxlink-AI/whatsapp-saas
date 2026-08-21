# OnyxLink: reglas permanentes para Claude Code

Antes de trabajar, lee `AGENTS.md`,
`docs/ONYXLINK-RUNBOOK-RECUPERACION.md` y
`docs/ONYXLINK-PROTOCOLO-CIERRE.md`. El protocolo de cierre forma parte de la
definición de terminado.

Para cualquier tarea de PWA, instalación en ordenadores/móviles o publicación
en tiendas, lee también `docs/ONYXLINK-PWA-ESCRITORIO-Y-TIENDAS.md`.

Para cualquier trabajo del panel Dirección, lee obligatoriamente
`docs/ONYXLINK-DIRECCION-CONTINUIDAD.md`. La excepción temporal descrita en
`docs/ONYXLINK-PUBLICACION-TEMPORAL-SIN-R2.md` ya no aplica: la primera copia
externa real quedó completada y verificada el 21/08/2026.

Ante cualquier error de Supabase, antes de cambiar Auth, RLS, Storage,
Realtime, credenciales o backups, lee
`docs/ONYXLINK-RUNBOOK-SUPABASE-INCIDENTES.md`.

Para reconstruir, verificar o restaurar el backup externo cifrado de R2, lee
obligatoriamente `docs/ONYXLINK-RECUPERACION-MAESTRA-BACKUP-R2.md` antes de
tocar credenciales, GitHub Environments, Supabase Production o Cloudflare.

Para dar de alta un cliente nuevo que vaya a usar la Agenda real (citas,
Google Calendar, Zoom), lee también
`docs/ONYXLINK-CHECKLIST-CLIENTE-NUEVO-AGENDA-CALENDARIO.md`.

Reglas:

- Respeta el trabajo existente y limita cada commit al alcance solicitado.
- No reveles ni versiones secretos, `.env*`, exportaciones de Bitwarden,
  volcados de bases de datos, `.vercel`, `.next`, `node_modules` ni temporales.
- No toques ni commitees:
  `scripts/check-secret-prefix.ts`,
  `scripts/diagnose-ycloud-live-webhook.ts` y
  `scripts/diagnose-ycloud.ts`.
- GitHub debe quedar comprobado y actualizado al cerrar un trabajo terminado.
- Vercel solo se despliega cuando el cambio está autorizado para producción y
  después de pasar las validaciones.
- Los cambios de Supabase exigen pruebas locales, migración versionada, copia
  recuperable previa y autorización antes de actuar en remoto.
- Si cambian credenciales, variables, API keys o 2FA, indica que se debe
  actualizar Bitwarden y renovar la exportación cifrada del disco externo, sin
  mostrar los valores.
- Tras cada versión importante, indica que se debe actualizar la copia fechada
  del proyecto oficial en el disco externo.
- La respuesta final debe informar: validaciones, commit/GitHub, despliegue,
  Supabase, copia externa, Bitwarden y estado de los scripts protegidos.

Nunca des por hecha una copia, actualización de credenciales o acción manual que
no hayas verificado.

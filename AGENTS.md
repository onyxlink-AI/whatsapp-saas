# OnyxLink: instrucciones operativas obligatorias

Estas instrucciones se aplican a cualquier agente que trabaje en este
repositorio.

## Fuente de verdad

- El repositorio oficial es `onyxlink-AI/whatsapp-saas`.
- La rama oficial es `main`.
- Antes de actuar, lee
  `docs/ONYXLINK-RUNBOOK-RECUPERACION.md` y
  `docs/ONYXLINK-PROTOCOLO-CIERRE.md`.
- Para trabajos de instalación o publicación en tiendas, lee además
  `docs/ONYXLINK-PWA-ESCRITORIO-Y-TIENDAS.md`.
- Para continuar el panel interno Dirección, lee obligatoriamente
  `docs/ONYXLINK-DIRECCION-CONTINUIDAD.md` antes de planificar o implementar.
- La excepción temporal de publicación sin R2 ya no aplica: la primera copia
  externa real quedó completada y verificada el 21/08/2026. No usar
  `docs/ONYXLINK-PUBLICACION-TEMPORAL-SIN-R2.md` como procedimiento vigente.
- Ante cualquier error de Supabase, antes de modificar Auth, RLS, Storage,
  Realtime, credenciales o backups, lee
  `docs/ONYXLINK-RUNBOOK-SUPABASE-INCIDENTES.md`.
- Para reconstruir, verificar o restaurar el backup externo cifrado de R2, lee
  obligatoriamente
  `docs/ONYXLINK-RECUPERACION-MAESTRA-BACKUP-R2.md` antes de tocar credenciales,
  GitHub Environments, Supabase Production o Cloudflare.
- Conserva todos los cambios previos del usuario y separa el alcance propio.

## Seguridad

- Nunca muestres, registres ni añadas a Git contraseñas, tokens, API keys,
  archivos `.env*`, exportaciones de Bitwarden o copias de bases de datos.
- Nunca ejecutes `supabase db reset` ni el seed contra producción.
- No toques ni añadas a commits estos scripts locales protegidos:
  - `scripts/check-secret-prefix.ts`
  - `scripts/diagnose-ycloud-live-webhook.ts`
  - `scripts/diagnose-ycloud.ts`
- No despliegues ni alteres datos remotos sin que el trabajo lo autorice.

## Cierre obligatorio de cada tarea

1. Valida el cambio en proporción al riesgo y revisa el diff.
2. Comprueba el estado de GitHub y publica el trabajo terminado autorizado.
3. Despliega en Vercel solo si el cambio debe llegar a producción; después
   verifica el dominio y el comportamiento real.
4. Si cambió Supabase, verifica migraciones, copias, RLS y aislamiento.
5. Si cambiaron accesos o secretos, recuerda actualizar Bitwarden y crear una
   nueva exportación cifrada en el disco externo. Nunca manipules ni solicites
   los valores secretos si no es imprescindible.
6. Tras una versión importante, recuerda la copia fechada del proyecto oficial
   en el disco externo.
7. En la entrega final informa del estado de código, GitHub, producción,
   Supabase, copia externa, Bitwarden y scripts protegidos. No afirmes que una
   acción manual se realizó si no fue verificada.

El procedimiento completo, resultados esperados, fallos y rollback están en el
protocolo de cierre. Estas reglas no dependen de la memoria de una conversación.

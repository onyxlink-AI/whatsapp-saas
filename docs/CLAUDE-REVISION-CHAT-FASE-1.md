# Revisión de arquitectura — Chat Fase 1

La entrega no se publica todavía. Corregir estos bloqueos sin iniciar documentos ni vídeo.

## 1. Offboarding y Chat desactivado no cortan Realtime

`auth_team_channel_ids()` solo consulta `team_channel_members`. Una persona desactivada conserva esas filas, por lo que la policy de `realtime.messages` todavía puede autorizar el topic. Además, apagar `team_chat_enabled` no elimina esa autorización.

Corrección:

- `auth_team_channel_ids()` debe exigir membership activa del mismo workspace y `workspaces.team_chat_enabled = true`.
- Mantener la comprobación también en las policies/tablas donde corresponda.
- Añadir pruebas Realtime reales: suscripción válida → desactivar membership → desconectar/reintentar → nunca `SUBSCRIBED`; repetir apagando el Chat.

## 2. Se puede crear un DM con el Chat apagado

`get_or_create_dm_channel()` valida memberships, pero no `team_chat_enabled`.

Corrección:

- Rechazar la RPC si el workspace no existe o Chat está desactivado.
- Probar que no crea canal ni participantes cuando está apagado.

## 3. Activación no atómica

La ruta actual actualiza `team_chat_enabled=true` y después llama a `enable_team_chat()`. Si la RPC falla, queda Chat activo sin General/backfill aunque la API responda 500.

Corrección:

- Una única RPC transaccional debe activar y provisionar General/miembros, o revertir explícitamente con garantía.
- La ruta no debe poder dejar un estado parcial.
- Añadir test de fallo provocado y comprobar rollback completo.

## 4. Invitación fallida puede dejar una cuenta huérfana

`provisionWorkspaceUser()` crea primero Auth + `users`; después `claim_workspace_seat()` puede fallar por cupo. Si era una cuenta nueva, queda creada sin membership y se pierde una plaza operativa/credencial que nadie recibe.

Corrección:

- Ante fallo de reserva, si `provisioned.created === true`, compensar eliminando de forma segura el perfil y Auth recién creados.
- No eliminar cuentas preexistentes.
- Probar cupo lleno con email nuevo y confirmar que no quedan filas en Auth ni `users`.
- Probar carrera de última plaza y confirmar que el perdedor tampoco deja una cuenta huérfana.

## 5. Cursor incompleto puede saltarse mensajes

La ordenación es `(created_at DESC, id DESC)`, pero el cursor solo guarda `createdAt` y filtra `created_at < cursor`. Dos mensajes con el mismo timestamp pueden omitirse entre páginas.

Corrección:

- Cursor compuesto `{ createdAt, id }`.
- Filtro lexicográfico: fecha menor, o misma fecha con id menor.
- Test con más de una página y timestamps idénticos; no duplicar ni perder mensajes.

## 6. Migración retroactiva de plazas

`human_member_limit DEFAULT 1` deja a cualquier workspace existente con más de un miembro humano inmediatamente por encima de su cupo, sin backfill basado en miembros actuales/paquete. No debe romper operaciones existentes al desplegar.

Corrección:

- Definir backfill conservador para existentes: nunca inferior al número actual de miembros humanos activos; aplicar también el mínimo comercial derivado acordado cuando corresponda.
- Workspaces nuevos sí reciben el default contractual definido.
- Probar un workspace existente con 2+ miembros antes de la migración.

## Validaciones para nueva entrega

- Ejecutar reset local desde cero.
- Repetir suite completa, typecheck, lint, build y diff-check.
- Añadir las pruebas anteriores con JWT y Realtime reales.
- Confirmar visualmente escritorio/móvil.
- Mantener la restauración independiente de `/pipeline` y Oportunidades en navegación.
- No tocar los tres scripts protegidos.
- Detenerse para segunda revisión; no commit, remoto ni producción todavía.

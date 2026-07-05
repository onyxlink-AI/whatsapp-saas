# CLAUDE INSTALL PROMPT

Copia este prompt en Claude Code dentro de `onyxlink/apps/whatsapp-saas/`.

```text
Lee primero estos documentos si existen:

- ../../ONX-CORE/
- ../../ONX-WHATSAPP-SAAS-CORE/
- ./_onyxlink-handoff/
- ./INSTALAR.md
- ./README.md
- ./CLAUDE.md

Objetivo:
Instalar y dejar funcionando la plataforma whatsapp-saas como ONX-CHAT AGENT de Onyxlink.

Reglas:
- No pegues ni pidas secretos reales en el chat.
- Crea archivos con placeholders para que yo rellene localmente.
- No subas .env.local ni tokens a Git.
- Usa YCloud como único proveedor WhatsApp.
- No uses Evolution API ni Baileys.
- Mantén multi-tenant por workspace.
- No crees un repo por cliente.
- Respeta ventana 24h y templates.
- Documenta errores y fixes en _onyxlink-handoff/10-ISSUES_AND_FIXES.md o en un archivo IMPLEMENTATION.md si ya existe.

Tareas:
1. Revisa el repo.
2. Revisa INSTALAR.md.
3. Dime requisitos faltantes.
4. Genera .env.local con placeholders.
5. Guíame para rellenar secretos localmente.
6. Aplica migraciones Supabase.
7. Crea super admin.
8. Despliega en Vercel.
9. Configura cron del buffer.
10. Verifica login e inbox.
11. Crea workspace piloto.
12. Prepara conexión YCloud.
13. Ejecuta smoke tests.
14. Documenta el estado final.

Antes de ejecutar acciones destructivas o sensibles, pídeme confirmación clara.
```

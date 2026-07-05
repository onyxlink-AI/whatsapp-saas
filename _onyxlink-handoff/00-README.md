# ONX WHATSAPP SAAS INSTALL HANDOFF v0.1

## Qué es

Paquete de handoff para instalar y auditar la plataforma `whatsapp-saas` dentro de Onyxlink.

Este paquete no contiene el repo de la app.

Sirve para guiar a Claude Code durante:

1. Instalación.
2. Configuración.
3. Auditoría.
4. Deploy.
5. Pruebas.
6. Primer workspace.
7. Documentación de errores.

## Ruta esperada

```text
onyxlink/
  apps/
    whatsapp-saas/
      _onyxlink-handoff/
```

## Qué debe existir antes

```text
onyxlink/
  ONX-CORE/
  ONX-OFFER/
  ONX-WHATSAPP-SAAS-CORE/
  plantillas/
    whatsapp-workspace-agent/
```

## Regla principal

Claude Code debe leer primero:

1. `onyxlink/ONX-CORE/`
2. `onyxlink/ONX-WHATSAPP-SAAS-CORE/`
3. Este handoff
4. El repo `apps/whatsapp-saas/`

## Prohibido

- Pegar secretos en el chat.
- Guardar API keys reales en `.md`.
- Subir secretos a Git.
- Crear repo nuevo por cliente.
- Usar Evolution API.
- Usar Baileys.
- Saltarse YCloud.
- Saltarse ventana 24h.

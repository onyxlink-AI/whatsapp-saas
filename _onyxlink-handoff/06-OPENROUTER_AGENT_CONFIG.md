# 06 - OPENROUTER AGENT CONFIG

## Objetivo

Configurar el modelo del agente por workspace.

## Datos

- API key de OpenRouter.
- Modelo principal.
- Modelo fallback.
- Límite de coste si aplica.
- Temperature.
- Max tokens.
- Memoria.

## Recomendación inicial

Para pruebas:

- Modelo económico y estable.
- Fallback activado.
- Autoetiquetado activado si existe.
- Resumen automático activado si existe.
- Buffer entre 10 y 30 segundos.

## Variables en prompt

- {agent_name}
- {business_name}
- {whatsapp_number}
- {contact_name}
- {workspace_timezone}
- {business_hours}

## Regla

No publicar prompt sin probarlo en playground o conversación real.

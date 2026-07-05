# 07 - HIGHLEVEL OPTIONAL

## Cuándo conectar HighLevel

Solo si el cliente necesita:

- Crear contactos.
- Crear oportunidades.
- Agendar citas.
- Consultar disponibilidad.
- Actualizar stages.
- Añadir tags.
- Registrar notas.

## Datos necesarios

- Location ID.
- Private Integration Token.
- Calendar ID.
- Pipeline.
- Stage inicial.
- Tags.
- Zona horaria.
- Reglas del calendario.

## Scopes

Pedir a Claude Code que revise scopes según el repo y la API de GHL.

Prompt recomendado:

```text
Voy a crear un token de Private Integration de GoHighLevel para agendamiento y CRM en este agente de WhatsApp. Revisa el código y dime qué scopes exactos necesito activar.
```

## Pruebas obligatorias

- Probar conexión.
- Consultar disponibilidad.
- Crear contacto.
- Crear cita.
- Revisar cita en GHL.
- Revisar lead en GHL.

## Regla

No prometer agendamiento si HighLevel no está conectado y probado.

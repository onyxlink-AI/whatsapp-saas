# 05 - YCLOUD FIRST WORKSPACE

## Objetivo

Crear el primer workspace piloto y conectar WhatsApp por YCloud.

## Checklist cliente/workspace

- [ ] Workspace creado.
- [ ] Usuario cliente creado.
- [ ] Caso de uso elegido.
- [ ] Número WhatsApp dedicado.
- [ ] WhatsApp Business configurado.
- [ ] Business Portfolio listo.
- [ ] Número enlazado en Meta.
- [ ] YCloud conectado por coexistencia.
- [ ] WABA ID obtenido.
- [ ] Phone ID obtenido.
- [ ] API key obtenida.
- [ ] Webhook URL pegada en YCloud.
- [ ] Webhook signing secret configurado.
- [ ] Eventos inbound/outbound/templates/contact activados.

## Prueba

Enviar mensaje desde otro WhatsApp.

Debe llegar a:

1. Móvil con WhatsApp Business.
2. Inbox de YCloud.
3. Inbox de Onyxlink.

## Si no llega

Revisar:

- URL de producción, no localhost.
- Webhook activo.
- Secret correcto.
- Eventos activados.
- Número correcto.
- Workspace correcto.

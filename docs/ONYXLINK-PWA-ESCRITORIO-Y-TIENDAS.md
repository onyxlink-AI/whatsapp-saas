# OnyxLink instalable: PWA, escritorio y tiendas móviles

**Propietario:** NexorLabs / OnyxLink
**Estado:** decisión aprobada, todavía no implementada
**Frecuencia de revisión:** antes de iniciar la implementación o publicar en una tienda
**Última actualización:** 30 de julio de 2026

## 1. Decisión de producto

Cuando llegue el momento, `https://onyxlinkpanel.com` se convertirá primero en
una PWA instalable. No se reconstruirá el SaaS como una aplicación diferente.

La PWA permitirá:

- instalar OnyxLink en Windows y macOS;
- instalarlo en Android, iPhone y iPad;
- mostrar el icono oficial y abrir una ventana independiente;
- conservar el mismo dominio, backend, autenticación y base de código;
- recibir las actualizaciones publicadas en Vercel.

La aplicación instalada seguirá necesitando Internet. No se pretende ofrecer un
OnyxLink completamente offline.

## 2. Coste previsto

Los importes oficiales deben volver a comprobarse justo antes de abrir las
cuentas, porque las plataformas pueden cambiarlos.

| Distribución | Coste oficial conocido el 30/07/2026 |
|---|---:|
| PWA instalada directamente desde el navegador en ordenador o móvil | Sin cuota de publicación |
| Google Play | 25 USD, un único pago de registro |
| Apple App Store | 99 USD por año de membresía |
| Ambas tiendas durante el primer año | 124 USD, más impuestos o conversión de moneda aplicables |
| Renovaciones posteriores si se mantienen ambas | 99 USD al año de Apple |

Fuentes oficiales:

- [PWA con Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Registro de Google Play Console](https://support.google.com/googleplay/android-developer/answer/6112435)
- [Apple Developer Program](https://developer.apple.com/programs/whats-included/)

Si el trabajo se realiza dentro del proyecto con Codex o Claude Code, no es
necesario contratar una reconstrucción completa. Sigue existiendo un coste real
de preparación, pruebas, revisión y mantenimiento. Si se externaliza, se debe
solicitar un presupuesto actualizado; la referencia preliminar tratada fue de
1.000 a 3.000 EUR, no un precio comprometido.

Para compilar y publicar en iOS se necesita acceso a macOS con Xcode o a un
servicio de compilación macOS. Ese posible coste no está incluido en las cuotas
anteriores.

## 3. Orden recomendado

### Fase 1: PWA instalable

1. Auditar la implementación actual de Next.js, manifest, middleware e iconos.
2. Crear una rama `feature/pwa-installable`.
3. Añadir manifest, iconos, metadatos y experiencia de instalación.
4. Implementar un service worker mínimo y seguro.
5. Validar escritorio, Android e instrucciones de instalación para iOS.
6. Publicar primero una Preview de Vercel.
7. Desplegar en producción solo después de aprobación visual y técnica.

**Resultado esperado:** el usuario instala OnyxLink desde
`onyxlinkpanel.com`, sin pagar tiendas ni mantener otra base de código.

### Fase 2: Google Play

Solo se iniciará si los clientes utilizan la versión instalable y existe una
razón comercial para aparecer en la tienda.

1. Abrir y verificar la cuenta de organización.
2. Confirmar la política de pagos vigente.
3. Empaquetar la PWA mediante una tecnología mantenida y compatible.
4. Preparar ficha, política de privacidad, capturas y pruebas.
5. Realizar una prueba cerrada antes de producción.
6. Publicar y monitorizar errores.

### Fase 3: Apple App Store

1. Abrir y verificar la cuenta de organización de Apple.
2. Disponer de macOS y Xcode o de compilación macOS autorizada.
3. Confirmar las reglas vigentes de aplicaciones empresariales y pagos.
4. Preparar una experiencia con valor suficiente para superar la revisión; no
   enviar un contenedor de baja calidad que parezca una simple web.
5. Probar con TestFlight.
6. Enviar a revisión y corregir cualquier observación antes de publicar.

## 4. Pagos y comisiones

La opción preferida para las tiendas es una aplicación de acceso para empresas
que ya contrataron OnyxLink:

- el usuario inicia sesión;
- usa los productos habilitados para su empresa;
- no compra, amplía ni renueva planes dentro de la aplicación;
- no se muestran precios ni llamadas a contratar fuera de la tienda sin haber
  confirmado antes que la política vigente lo permite.

Apple contempla determinados servicios empresariales previamente adquiridos y
aplicaciones gratuitas que acompañan a herramientas web, con condiciones.
Google incluye el software empresarial y los servicios en la nube dentro de su
política de pagos cuando se venden funciones digitales en la aplicación.

Fuentes que se deben volver a revisar antes de publicar:

- [Normas de revisión de Apple](https://developer.apple.com/app-store/review/guidelines/)
- [Política de pagos de Google Play](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Tarifas de servicio de Google Play](https://support.google.com/googleplay/android-developer/answer/112622)

No se debe asumir que las comisiones serán cero sin revisar la versión vigente
de estas normas y el flujo comercial exacto que vaya a utilizar OnyxLink.

## 5. Seguridad obligatoria de la PWA

La instalación no puede debilitar el aislamiento ni la privacidad del SaaS.

Nunca se almacenarán offline:

- sesiones, tokens o cookies;
- respuestas de `/api`;
- contactos, conversaciones o mensajes;
- documentos del negocio;
- prompts, agentes o configuraciones;
- informes, datos de Oficina Virtual o información de otra empresa;
- peticiones o respuestas de Supabase;
- webhooks o operaciones de escritura.

El service worker debe:

- usar red primero para las navegaciones;
- ignorar `POST`, `PUT`, `PATCH` y `DELETE`;
- limitar la caché a una lista explícita de iconos y recursos públicos;
- mostrar sin conexión una página neutral sin datos del cliente;
- eliminar cachés antiguas;
- actualizarse sin interrumpir formularios ni configuraciones abiertas.

Texto recomendado para el estado sin conexión:

> OnyxLink necesita conexión a Internet para proteger y sincronizar los datos
> de tu empresa.

## 6. Experiencia de instalación

La opción visible será `📲 Instalar OnyxLink`.

- En Windows, macOS compatible y Android se utilizará el diálogo de instalación
  del navegador.
- En iPhone y iPad se mostrarán instrucciones para usar
  **Compartir → Añadir a pantalla de inicio**.
- Si la aplicación ya está instalada, la invitación debe desaparecer.
- Si el navegador no es compatible, no se mostrará un botón que no funcione.
- La instalación no cambiará login, permisos, roles ni productos contratados.

## 7. Verificación antes de aprobar

- [ ] Manifest válido y sin errores.
- [ ] Iconos oficiales de 192, 512 y versión `maskable`.
- [ ] Middleware no bloquea manifest, service worker, iconos ni recursos públicos.
- [ ] Login y cierre de sesión funcionan en modo navegador y `standalone`.
- [ ] Superadministrador y cliente mantienen sus permisos.
- [ ] No existe fuga entre empresas.
- [ ] Cache Storage contiene únicamente recursos públicos permitidos.
- [ ] Ninguna API o página autenticada aparece en caché.
- [ ] Offline muestra solo la pantalla neutral.
- [ ] La actualización de versión no mezcla archivos ni pierde cambios abiertos.
- [ ] Oficina Virtual funciona en móvil y escritorio.
- [ ] Consola sin errores y recursos PWA sin respuestas 400 o 500.
- [ ] TypeScript, lint, pruebas y build pasan.
- [ ] Pruebas manuales en un ordenador y un teléfono real.

## 8. Rollback

Si la PWA produce errores:

1. detener el despliegue;
2. mantener o promover en Vercel el último despliegue estable;
3. publicar una versión que desregistre el service worker defectuoso y elimine
   únicamente sus cachés identificadas;
4. no borrar almacenamiento del usuario de forma indiscriminada;
5. verificar login, navegación e aislamiento antes de reintentar.

## 9. Condiciones para iniciar el trabajo

Antes de implementar:

- confirmar por escrito que se inicia la Fase 1;
- volver a comprobar la documentación oficial de Next.js y navegadores;
- trabajar primero en local y en una rama;
- no tocar Supabase ni producción durante el desarrollo;
- aplicar `docs/ONYXLINK-PROTOCOLO-CIERRE.md`.

## 10. Historial

| Fecha | Responsable | Nota |
|---|---|---|
| 30/07/2026 | Codex / OnyxLink | Registrada la decisión de comenzar por PWA gratuita y dejar las tiendas como fases posteriores. |

## Qué cambia

<!-- Explica el resultado para el cliente, no solo los archivos modificados. -->

## Riesgo y compatibilidad

- [ ] El cambio conserva compatibilidad con la versión que está actualmente en producción.
- [ ] Las migraciones son aditivas (`expand`) y no eliminan ni renombran datos usados por la versión anterior.
- [ ] Cualquier función incompleta queda detrás de un entitlement, kill switch o feature flag.
- [ ] No se han incluido secretos, copias de datos, `.env`, artefactos locales ni scripts protegidos.

## Verificación

- [ ] `npm run validate` termina correctamente con Supabase local.
- [ ] Se ha comprobado el flujo afectado en escritorio y móvil.
- [ ] Se han probado permisos, aislamiento entre empresas y estados vacío/error cuando aplican.
- [ ] Staging ha pasado y el SHA validado es exactamente el que se pretende publicar.

## Publicación y vuelta atrás

- [ ] Hay backup físico reciente de Supabase y el preflight remoto es correcto.
- [ ] Está identificado el rollback de aplicación y, si hay migración, su estrategia de compatibilidad.
- [ ] Se ha definido el smoke test autenticado posterior al despliegue.
- [ ] Hay una persona disponible durante los 15 minutos de observación posteriores.

## Después de publicar

- [ ] Login y rutas públicas correctas.
- [ ] Dashboard y flujo principal correctos con sesión real.
- [ ] Logs de Vercel y Supabase sin errores nuevos.
- [ ] Activación gradual de flags completada o mantenida en pausa.

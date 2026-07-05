# 01 - INSTALLATION PLAN

## Objetivo

Instalar `whatsapp-saas` dentro de:

```text
onyxlink/apps/whatsapp-saas/
```

## Comando base

Desde la carpeta:

```text
onyxlink/apps/
```

Ejecutar:

```bash
git clone https://github.com/Carlos-Dominguez-faber/whatsapp-saas
cd whatsapp-saas
claude "lee INSTALAR.md e instálalo siguiendo también las reglas de _onyxlink-handoff"
```

## Si el repo ya está clonado

Entrar en:

```bash
cd onyxlink/apps/whatsapp-saas
```

Y abrir Claude Code ahí.

## Orden de trabajo

1. Leer `INSTALAR.md`.
2. Leer `_onyxlink-handoff/`.
3. Detectar requisitos.
4. Crear `.env.local` con placeholders.
5. Pedir al usuario que rellene secretos en local.
6. Ejecutar instalación.
7. Aplicar migraciones.
8. Crear super admin.
9. Deploy en Vercel.
10. Revisar build.
11. Probar login.
12. Crear workspace piloto.
13. Conectar YCloud.
14. Enviar mensaje de prueba.
15. Documentar resultado.

## Resultado esperado

Plataforma funcionando en producción y lista para clientes.

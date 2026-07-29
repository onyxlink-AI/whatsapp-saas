# Reglas de componentes — OnyxLink Business OS

Leer este archivo antes de crear o modificar cualquier componente visual.
Última actualización: 2026-07-27.

## Dirección visual

OnyxLink debe sentirse como un sistema operativo empresarial: limpio, sereno, compacto y fácil de recorrer. La referencia de categoría es la claridad de productos como Holded, sin copiar su marca, colores, ilustraciones ni composición literal.

La identidad propia de OnyxLink se mantiene mediante:

- Violeta como color de acción y estados activos.
- Barra lateral oscura en escritorio.
- Superficies claras, ordenadas y con poco ruido.
- Tipografía Space Grotesk en títulos y Geist Sans en interfaz.
- Lenguaje sencillo en español.

La fuente de verdad visual es `http://localhost:3000/ui` en desarrollo y los componentes compartidos de `src/components/ui`.

## 1. Estructura de producto

- En escritorio, la navegación principal vive en la barra lateral.
- La cabecera superior se reserva para contexto, búsqueda y utilidades.
- En móvil, se muestran hasta cuatro destinos principales y un menú “Más” cuando sea necesario.
- Cada ruta debe indicar claramente la sección activa.
- No volver a colocar todos los productos como botones en la cabecera.

## 2. Jerarquía de página

Las pantallas de gestión utilizan:

- `.page-shell` para ancho y separación exterior.
- `PageHeader` para categoría, título, descripción y acciones.
- `.surface-card` para contenido principal.
- `.surface-subtle` para columnas, agrupaciones y fondos secundarios.

No comenzar una pantalla con una tarjeta decorativa o banner si retrasa la tarea principal.

## 3. Tokens de color

Usar siempre tokens semánticos:

`background`, `foreground`, `card`, `muted`, `primary`, `secondary`, `accent`, `destructive`, `success`, `warning`, `info`, `border`, `input`.

Ejemplo correcto: `bg-primary text-primary-foreground`.

No introducir hexadecimales dentro de componentes. Los valores físicos solo pueden existir en la definición central del sistema, como el fondo especial de `.app-sidebar`.

El violeta es selectivo: CTA principal, navegación activa, foco y estados destacados. No teñir todas las superficies.

## 4. Tipografía

- Títulos: `font-display` — Space Grotesk.
- Interfaz y cuerpo: Geist Sans.
- Identificadores y datos técnicos: `font-mono` — Geist Mono.

Los títulos de página deben explicar el resultado esperado, no repetir términos técnicos internos.

## 5. Superficies

- `surface-card`: paneles, tablas, formularios y tarjetas principales.
- `surface-subtle`: columnas Kanban y agrupaciones secundarias.
- `glass` y `glass-strong`: solo overlays o casos especiales. No son la superficie predeterminada.
- Nunca anidar vidrio dentro de vidrio.
- Evitar bordes de colores intensos alrededor de paneles completos; usar color en indicadores pequeños.

## 6. Controles

- Altura normal: 40 px.
- Acciones pequeñas: 36 px.
- Objetivos táctiles importantes: 44 px cuando el contexto lo permita.
- Radio estándar: `rounded-lg`.
- El foco visible es obligatorio.
- Máximo un botón `default` por grupo de acciones.
- Los botones deben describir el resultado: “Nueva oportunidad”, no “Nuevo deal”.

## 7. Estados obligatorios

Todo componente con datos contempla:

1. Cargando: skeleton parecido al contenido final.
2. Error: explicación clara y acción de recuperación.
3. Vacío: icono, explicación y siguiente paso cuando exista.
4. Datos: contenido real.

Nunca presentar fixtures como información real.

## 8. Iconografía

Solo Lucide React.

- 16 px dentro de controles.
- 18–20 px en navegación.
- 20–24 px como icono independiente.
- Los botones formados solo por un icono necesitan `aria-label`.

Los emojis se reservan para textos de ayuda o estados donde aumenten la comprensión; no sustituyen la iconografía del sistema.

## 9. Motion

Usar `@/features/ui-kit/motion`.

- 150 ms para hover y foco.
- 200 ms para entradas y cambios de estado.
- 350 ms para paneles y drawers.
- Animar transform, opacity, color, background, border o shadow.
- No animar width, height, padding, margin ni posición de layout.

Respetar `prefers-reduced-motion`.

## 10. Accesibilidad

- Inputs unidos a su `Label` mediante `htmlFor` e `id`.
- Contraste suficiente en ambos temas.
- Navegación completa con teclado.
- Estado activo mediante `aria-current="page"`.
- Loading mediante `disabled` y `aria-busy`.
- Ningún significado debe depender exclusivamente del color.

## 11. Temas

El tema claro es el predeterminado porque facilita la lectura de un SaaS de gestión. El modo oscuro sigue completamente soportado mediante el selector.

No usar `bg-white`, `text-black` o grises arbitrarios en las superficies normales. La barra lateral es la única superficie de marca deliberadamente oscura en ambos temas.

## 12. Lenguaje

- “Empresa”, no “workspace”.
- “Oportunidad”, no “deal”.
- “Conversaciones”, no “inbox”, salvo cuando sea imprescindible por marca externa.
- “Consumo de IA”, no “tokens LLM”, en vistas para clientes.
- Explicar qué puede hacer la persona y qué ocurrirá después.

Los detalles técnicos se muestran únicamente en una segunda capa para administradores.

## 13. Antes de entregar

Verificar como mínimo:

- 1440 px de ancho.
- 390 px de ancho.
- Tema claro y oscuro.
- Sin desplazamiento horizontal accidental.
- Sección activa correcta.
- TypeScript, ESLint, tests y build.
- Ningún cambio de UI altera permisos, aislamiento, integraciones o lógica de negocio.

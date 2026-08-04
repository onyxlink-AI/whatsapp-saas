# OnyxLink Gestión — implementación en tres fases

## Cómo usar este documento

Entrega este archivo completo a Claude Code y dale una sola orden cada vez:

1. `Ejecuta únicamente la Fase 1 de este documento.`
2. Tras la revisión de Codex: `Ejecuta únicamente la Fase 2.`
3. Tras la segunda revisión: `Ejecuta únicamente la Fase 3.`

Claude Code debe detenerse al finalizar cada fase. No debe anticipar trabajo de la
fase siguiente, publicar cambios ni desplegar.

---

## Reglas comunes obligatorias

Antes de actuar, leer completamente:

- `AGENTS.md`
- `CLAUDE.md`
- `COMPONENT_RULES.md`
- `docs/ONYXLINK-RUNBOOK-RECUPERACION.md`
- `docs/ONYXLINK-PROTOCOLO-CIERRE.md`
- La implementación actual de workspaces, productos, navegación, Proyectos,
  Pipeline, Pizarra/Whiteboard, tareas, subtareas, equipo, asistente de ayuda,
  Oficina Virtual, Supabase y RLS.

Reglas permanentes:

- Conservar todos los cambios existentes.
- No tocar ni versionar:
  - `scripts/check-secret-prefix.ts`
  - `scripts/diagnose-ycloud-live-webhook.ts`
  - `scripts/diagnose-ycloud.ts`
- No desplegar.
- No publicar en GitHub.
- No modificar producción.
- No aplicar migraciones remotas.
- No modificar internamente Oficina Virtual.
- Mantener multi-tenancy, RLS, roles, auditoría y datos existentes.
- Priorizar una base técnica sólida y componentes reutilizables. Codex hará la
  auditoría y el refinamiento visual final.
- Cada fase debe quedar terminada, estable y validada antes de detenerse.

Validaciones mínimas al cerrar cada fase:

```bash
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

También revisar escritorio, móvil, superadministrador, cliente, estados vacíos,
carga, error y consola del navegador.

---

# FASE 1 — Paquetes, navegación y centro de Proyectos

## Objetivo

Implantar la nueva jerarquía comercial, mover el asistente a la barra superior y
convertir Proyectos en el centro de trabajo de Gestión. No rediseñar todavía las
funciones internas.

## 1. Jerarquía comercial

### Paquete 1 — OnyxLink Gestión

Incluye siempre:

- Clientes.
- Proyectos.
- Tareas.
- Agenda.
- Board.
- Anotaciones, aunque su editor se implementará en la Fase 2.
- Pipeline.
- Mi equipo, cuya experiencia completa se implementará en la Fase 2.
- Contenido, que se implementará en la Fase 3.
- Asistente informativo.

El asistente informativo:

- Responde preguntas sobre OnyxLink.
- Explica cómo utilizar el panel.
- No recibe herramientas de escritura.
- No crea, edita, mueve ni elimina información.

### Paquete 2 — Gestión + Agente de WhatsApp

Incluye todo Gestión más:

- Inicio relacionado con WhatsApp.
- Conversaciones.
- Agentes.
- Recordatorios.
- Integraciones.
- Herramientas.
- Mensajes.
- Base de conocimiento.
- Automatizaciones.
- Mejoras adicionales contratadas.
- Asistente de gestión actual.

El asistente de gestión:

- Puede crear y editar clientes, proyectos y tareas.
- Puede crear y mover oportunidades.
- Nunca elimina información.
- Mantiene permisos, validaciones y auditoría actuales.

WhatsApp incluye siempre Gestión. No debe poder existir comercialmente:

```text
whatsapp_agent_enabled = true
gestion_enabled = false
```

Al activar WhatsApp:

- Activar Gestión de forma atómica.
- Mostrar que Gestión está incluida.

Al intentar desactivar Gestión con WhatsApp activo:

- Impedirlo.
- Explicar que primero debe desactivarse WhatsApp.

No corregir datos remotos. Si existen fixtures locales incoherentes, crear una
migración o estrategia aditiva segura y documentarla.

### Paquete 3 — Suite completa, todavía sin nombre

Incluye:

- Todo Gestión.
- Todo WhatsApp.
- Oficina Virtual.
- Especialistas, orquestador y artefactos actuales.

No cambiar Oficina Virtual internamente.

Mantener como complementos independientes:

- Chatbot.
- Agente de voz.
- Memoria avanzada.
- Pipeline con IA.
- Recuperación de leads.
- Memoria compartida.

## 2. Navegación por paquete

### Gestión sin WhatsApp

- Clientes.
- Proyectos.
- Mi equipo.
- Contenido.
- Ajustes.
- Si no hay un Inicio específico de Gestión, el destino inicial será Clientes.

### Gestión + WhatsApp

- Inicio.
- Conversaciones.
- Clientes.
- Proyectos.
- Mi equipo.
- Contenido.
- Ajustes.

### Suite completa

- Todo lo anterior.
- Oficina Virtual.

Eliminar como entradas independientes del menú:

- Pipeline/Oportunidades.
- Pizarra.

## 3. Proyectos como centro

Dentro de Proyectos preparar estas vistas:

1. Proyectos.
2. Tareas.
3. Agenda.
4. Board.
5. Anotaciones.
6. Pipeline.

La vista activa debe persistir en URL:

```text
/proyectos?view=projects
/proyectos?view=tasks
/proyectos?view=agenda
/proyectos?view=board
/proyectos?view=notes
/proyectos?view=pipeline
```

Debe funcionar con enlaces directos y botones anterior/siguiente del navegador.

Reutilizar los componentes actuales de Pipeline y Board. En esta fase basta con
integrarlos de forma estable; sus mejoras profundas pertenecen a la Fase 2.

Mantener compatibilidad con enlaces antiguos:

- `/pipeline` redirige a `/proyectos?view=pipeline`.
- `/pizarra` redirige a `/proyectos?view=board`.
- Las rutas profundas necesarias para editar un board pueden conservarse.

Renombrar todos los textos visibles de Pizarra a **Board**. No renombrar tablas
o columnas si aumenta el riesgo sin aportar valor.

## 4. Asistente en la barra superior

Eliminar el lanzador flotante inferior y moverlo a la barra superior, cerca de
Búsqueda, Tema y controles globales.

Escritorio:

- Icono reconocible.
- Texto `Asistente` cuando haya espacio.
- Tooltip `Asistente de ayuda`.
- Estado abierto/cerrado claro.

Móvil:

- Control compacto.
- No competir con la navegación inferior.
- No tapar contenido.
- Panel adaptado al ancho disponible.

Los permisos se resuelven en servidor con los flags del workspace:

- Gestión sin WhatsApp: soporte informativo, sin herramientas de escritura.
- Gestión + WhatsApp: herramientas actuales de gestión, nunca borrar.
- Suite completa: mismo modo gestión, sin alterar Oficina Virtual.

No confiar únicamente en ocultar botones del cliente.

## 5. Panel del superadministrador

Representar claramente:

- Gestión como base.
- WhatsApp como ampliación que incluye Gestión.
- Suite completa como Gestión + WhatsApp + Oficina Virtual.
- Complementos independientes.
- Paquete efectivo.
- Productos incluidos.
- Dependencias.
- Estado de preparación.
- Configuraciones pendientes.

Evitar interruptores contradictorios. No decidir aún el nombre comercial del
paquete completo.

## 6. Pruebas específicas de Fase 1

- Gestión sin WhatsApp.
- Gestión + WhatsApp.
- Suite completa.
- WhatsApp activa también Gestión.
- No se puede desactivar Gestión con WhatsApp activo.
- Navegación por paquete.
- Redirecciones antiguas.
- Query param de Proyectos.
- Asistente informativo sin escritura.
- Asistente de gestión sin herramientas destructivas.
- Escritorio y móvil.

## Entrega de Fase 1

Detenerse y entregar:

- Resumen técnico.
- Archivos modificados.
- Migraciones locales, si existen.
- Pruebas y resultados.
- Capturas o descripción de las vistas.
- Riesgos y decisiones pendientes.
- Estado de Git.
- Confirmación de que no se modificó producción, Supabase remoto ni los scripts
  protegidos.

---

# FASE 2 — Trabajo, equipo, Board y Anotaciones

## Objetivo

Convertir Gestión en una herramienta operativa completa: proyectos visuales,
tareas independientes, progreso, equipo, Board mejorado y editor de documentos.

Esta fase empieza únicamente después de que Codex apruebe la Fase 1.

## 1. Proyectos

Añadir:

- Estado activo o inactivo.
- Filtros Activos, Inactivos y Todos.
- Vista de tablero mejorada.
- Vista Bento Grid.
- Selector de vista.
- Imagen de portada.
- Miniatura exterior.
- Responsable.
- Fechas.
- Número de tareas y subtareas.
- Barra de progreso.
- Acceso claro al detalle.

La imagen debe:

- Guardarse en Supabase Storage.
- Estar aislada por workspace.
- Validar tipo y tamaño.
- Poder sustituirse y eliminarse.
- Tener fallback visual.

Dentro del proyecto mostrar:

- Información general.
- Imagen.
- Responsable y miembros relacionados.
- Fechas y estado.
- Tareas y subtareas.
- Checklists.
- Progreso.
- Actividad relevante.

Definir y documentar una fórmula determinista de progreso basada en tareas,
subtareas y elementos de checklist completados.

No destruir datos existentes. Usar migraciones aditivas con defaults seguros.

## 2. Tareas

Permitir crear tareas:

- Sin proyecto.
- Desde un proyecto.
- Asociarlas posteriormente.
- Desasociarlas.
- En lote.

Creación en lote:

- Una tarea por línea o filas dinámicas.
- Proyecto, responsable, tipo y fecha comunes opcionales.
- Confirmación antes de guardar.
- Comunicar resultados parciales si una fila falla.

Cada tarea tendrá:

- Título.
- Descripción.
- Estado.
- Tipo de trabajo.
- Prioridad.
- Responsable.
- Proyecto opcional.
- Fecha.
- Checklist.
- Subtareas.
- Barra de progreso.

Añadir tipos:

- Deep Work.
- Crear contenido.

Mantener los tipos actuales.

Subtareas:

- Crear y editar.
- Completar.
- Reordenar si puede hacerse con seguridad.
- Responsable y fecha opcionales.
- Progreso visual.
- Confirmación antes de eliminar.
- RLS y aislamiento por workspace.

## 3. Mi equipo

Crear un módulo operativo independiente de la pestaña técnica de usuarios de
Ajustes.

Debe permitir:

- Ver miembros del panel.
- Nombre, correo, rol y estado.
- Buscar y filtrar.
- Añadir mediante el flujo seguro actual.
- Ver quién puede asignarse como responsable.
- Ficha sencilla con tareas y proyectos asignados cuando sea viable.

Los miembros deben poder asignarse en:

- Proyectos.
- Tareas.
- Subtareas.
- Contenidos de la Fase 3.

Desde los selectores de responsable incluir `Añadir miembro`, abrir el flujo de
incorporación sin perder el formulario y seleccionar al nuevo miembro cuando
sea seguro.

No crear otro sistema de usuarios. Reutilizar `users`, `memberships`, roles y
RLS actuales.

## 4. Mejoras de Board

Reutilizar capacidades nativas de Excalidraw. No crear un motor paralelo.

Ocultar o eliminar de la interfaz:

- Compartir por Discord.
- Compartir por Twitter/X.
- Compartir por GitHub.
- Promociones externas no útiles para OnyxLink.

Mantener acciones relevantes como guardar, exportar de forma segura, duplicar
y volver a Proyectos.

Notas y conexiones:

- Al seleccionar una nota, conectores arriba, abajo, izquierda y derecha.
- Arrastrar un conector para crear una flecha.
- Conectar con otra nota.
- Poder crear otra nota ya conectada.
- Mantener el enlace al mover notas.
- Usar arrow binding nativo de Excalidraw cuando sea posible.

Alineación:

- Guías magnéticas.
- Alineación horizontal y vertical.
- Distribución uniforme.
- Ajuste sencillo con cursor.
- Acciones para ordenar la selección.

Tipografía:

- Corregir el cambio de fuente.
- Sans moderna.
- Serif.
- Monoespaciada.
- Manuscrita si Excalidraw la soporta correctamente.

Colores:

- Más colores predeterminados.
- Selector visual completo.
- Nunca obligar a introducir códigos.
- Fondo y borde/texto cuando corresponda.
- Contraste accesible.
- Persistencia correcta.

## 5. Anotaciones

Crear una vista independiente de Board dentro de Proyectos.

Funciones:

- Crear documento.
- Editar y renombrar.
- Duplicar.
- Archivar.
- Buscar.
- Asociar opcionalmente a un proyecto.
- Copiar y pegar desde Microsoft Word.
- Conservar razonablemente párrafos, H1, H2, H3, negrita, cursiva, listas y
  enlaces.
- Sanitizar estilos y HTML inseguros.

Formato deliberadamente simple:

- H1, H2 y H3.
- Párrafo.
- Listas con viñetas y numeradas.
- Negrita y cursiva.
- Enlaces.
- Alineación básica.
- Pocas tipografías modernas.
- Tamaños limitados y coherentes.

Plantillas:

- Documento en blanco.
- Reunión.
- Brief.
- Propuesta.
- Procedimiento.
- Plan de proyecto.
- Notas rápidas.
- Informe.

Si el drag and drop introduce demasiado riesgo, comenzar con galería e inserción
por clic, dejando preparada la arquitectura para arrastrar posteriormente.

Elegir un editor mantenido y compatible con Next.js 16, React 19, TypeScript,
pegado desde Word, sanitización y persistencia estructurada. Justificar cualquier
dependencia nueva.

## 6. Datos y seguridad de Fase 2

Reutilizar `projects`, `tasks`, `subtasks`, `memberships`, `users`, `whiteboards`
y auditoría.

Crear solo lo imprescindible para:

- Imagen de proyecto.
- Estado activo/inactivo.
- Checklist si el modelo actual no basta.
- Progreso.
- Anotaciones.

Toda tabla nueva debe incluir workspace, claves foráneas, índices, timestamps,
RLS y políticas por membresía.

## 7. Pruebas específicas de Fase 2

- Tareas sin proyecto.
- Asociación y desasociación.
- Creación en lote.
- Subtareas.
- Checklist y progreso.
- Proyectos activos/inactivos.
- Imágenes y aislamiento de Storage.
- Responsables.
- Mi equipo.
- Board, conexiones y persistencia.
- Documentos por workspace.
- Sanitización de Word.
- Responsive.

## Entrega de Fase 2

Detenerse y entregar el mismo informe obligatorio definido en la Fase 1. No
publicar ni desplegar.

---

# FASE 3 — Creación de contenido y cierre visual

## Objetivo

Crear el módulo completo de Contenido, integrar responsables y proyectos, y
realizar el cierre funcional y visual de todo OnyxLink Gestión.

Esta fase empieza únicamente después de que Codex apruebe la Fase 2.

## 1. Módulo Contenido

Crear un módulo de Gestión con:

1. Ideas.
2. Guiones.
3. Pipeline.
4. Teleprompter.

Cada pieza de contenido puede incluir:

- Título.
- Idea principal.
- Descripción.
- Guion.
- Bullet points.
- Referencias.
- Enlaces.
- Notas.
- Luces.
- Música.
- Red social.
- Formato vertical u horizontal.
- Tipo de contenido.
- Estado.
- Responsable.
- Fecha prevista.
- Fecha de publicación.
- Proyecto opcional.
- Métricas posteriores.

Estados:

1. Idea.
2. En producción.
3. Listo para subir.
4. Publicado.

## 2. Ideas

- Creación rápida.
- Vista compacta.
- Buscar y filtrar.
- Referencias y enlaces.
- Convertir una idea en contenido o guion.
- Asociación opcional con proyecto y responsable.

## 3. Guiones

Editor especializado en reels y contenido breve:

- Título.
- Hook.
- Desarrollo.
- Cierre.
- CTA.
- Bullet points.
- Referencias.
- Indicaciones visuales.
- Luces.
- Música.
- Duración estimada.
- Red social.
- Orientación.
- Tipo de contenido.

Añadir botón `Estructuras de guion` con tarjetas o tablas de solo lectura:

1. Problema → tensión → solución → CTA.
2. Hook → tres ideas → conclusión.
3. Error común → explicación → alternativa.
4. Historia breve → aprendizaje → CTA.
5. Antes → transformación → después.
6. Pregunta → respuesta → ejemplo.
7. Lista rápida de consejos.
8. Mito → realidad → recomendación.

Las estructuras solo inspiran; no modifican automáticamente el guion.

## 4. Pipeline de contenido

- Kanban con drag and drop.
- Idea, En producción, Listo para subir y Publicado.
- Tarjetas compactas.
- Responsable.
- Red social.
- Fecha.
- Formato.
- Acceso al guion.
- Métricas cuando esté publicado.

## 5. Teleprompter

- Abrir desde un guion.
- Modo lectura sin distracciones.
- Play y pausa.
- Reiniciar.
- Velocidad configurable.
- Tamaño de texto configurable.
- Color de texto y fondo.
- Pantalla completa si el navegador lo permite.
- Mantener posición al pausar.
- Controles accesibles.
- Excelente uso en móvil.

## 6. Métricas manuales

Permitir registrar:

- Visualizaciones.
- Alcance.
- Me gusta.
- Comentarios.
- Compartidos.
- Guardados.
- Clics.
- Leads.
- Observaciones sobre repercusión.

No integrar APIs de redes sociales en esta fase.

## 7. Datos y seguridad de Fase 3

Crear únicamente las tablas necesarias para contenidos y métricas. Todas deben
tener workspace, relaciones, índices, timestamps, RLS y auditoría cuando
corresponda.

Relacionar contenidos opcionalmente con proyectos y miembros existentes. No
duplicar usuarios ni proyectos.

## 8. Cierre visual global

Sin rediseñar OnyxLink, mejorar coherentemente:

- Proyectos.
- Tareas.
- Board.
- Anotaciones.
- Contenido.

Usar:

- Miniaturas.
- Barras de progreso.
- Estados claros.
- Jerarquía.
- Acciones rápidas.
- Tarjetas compactas.
- Estados vacíos útiles.
- Skeletons.
- Errores comprensibles.
- Tema claro y oscuro.
- Adaptación real a móvil.

Codex realizará la auditoría visual definitiva después de esta fase.

## 9. Pruebas específicas de Fase 3

- Ideas y conversión a guion.
- Kanban y cambios de estado.
- Aislamiento de contenidos por workspace.
- Asociación con proyecto y responsable.
- Guiones y estructuras de ayuda.
- Teleprompter: play, pausa, velocidad y posición.
- Métricas.
- Permisos.
- Escritorio, móvil y temas.
- Regresión completa de las fases 1 y 2.

## Entrega final de Fase 3

Detenerse y entregar:

- Resumen de las tres fases.
- Arquitectura final.
- Archivos y migraciones.
- Dependencias y justificación.
- Pruebas completas.
- Capturas o descripción de pantallas.
- Riesgos pendientes.
- Decisiones que necesiten aprobación de Codex.
- Estado de Git.
- Confirmación de que no se publicó, desplegó ni modificó Supabase remoto.
- Confirmación de que los scripts protegidos siguen intactos.


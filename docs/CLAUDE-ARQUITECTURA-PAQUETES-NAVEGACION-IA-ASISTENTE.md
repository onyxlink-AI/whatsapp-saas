# Encargo para Claude — Paquetes, navegación, guiones con IA y asistente completo

## 0. Mandato y límites

Implementa este documento por fases y detente al terminar cada fase para revisión. No despliegues a producción, no ejecutes migraciones remotas y no hagas `push` hasta recibir autorización expresa.

Conserva sin tocar los tres scripts protegidos:

- `scripts/check-secret-prefix.ts`
- `scripts/diagnose-ycloud-live-webhook.ts`
- `scripts/diagnose-ycloud.ts`

No mezcles en estos commits cambios del Chat de equipo ni cambios locales ajenos. Antes de editar, revisa `git status`, `AGENTS.md`, `docs/AI-RUNBOOK.md` y `docs/PROTOCOLO-TRABAJO-CODEX-CLAUDE.md`.

La prioridad es mantener aislamiento por `workspace_id`, RLS, permisos y compatibilidad con los clientes actuales. Cambiar de paquete jamás debe borrar datos ni crear agentes ficticios.

---

## 1. Conclusiones de la auditoría actual

### 1.1 Oportunidades está duplicado de verdad

La página principal correcta ya existe en `/pipeline` y la navegación lateral ya muestra **Oportunidades** de forma independiente. La duplicación está dentro de Proyectos:

- `src/app/(main)/proyectos/page.tsx` acepta `view=pipeline`, carga deals, miembros del pipeline y contactos.
- `src/features/projects/components/proyectos-hub.tsx` importa y renderiza `PipelineBoard` y muestra la pestaña Oportunidades.
- El prompt y sus tests todavía envían al usuario a `/proyectos?view=pipeline`.

Hay que retirar exclusivamente esa duplicación. No rediseñar ni alterar `/pipeline`.

### 1.2 Contenido tiene el orden contrario al solicitado

`content-hub.tsx` muestra actualmente Pipeline, Ideas y Guiones, y abre Pipeline por defecto. El orden nuevo será Ideas, Pipeline, Guiones y después cualquier herramienta futura.

### 1.3 Los paquetes no son todavía paquetes

En Ajustes existen interruptores independientes (`gestion_enabled`, `whatsapp_agent_enabled`, `office_virtual_enabled`, etc.). WhatsApp fuerza Gestión, pero no hay una fuente canónica que represente el paquete comercial completo. Esto permite estados incoherentes, hace difícil bajar de plan y mezcla productos incluidos con extras pagados.

La solución no es disparar varios `PATCH` desde el navegador. Debe existir una operación atómica de servidor/BD que cambie el paquete completo o no cambie nada.

### 1.4 El asistente de gestión no puede hacer “todo” todavía

Actualmente dispone de herramientas para:

- clientes;
- oportunidades;
- proyectos y tareas;
- crear, buscar y renombrar tableros Board.

No puede operar todavía:

- elementos internos del Board (notas, conectores, texto, formas);
- agenda;
- anotaciones;
- contenido: ideas, guiones, estados, métricas y teleprompter;
- subtareas y varias operaciones completas de tareas/proyectos.

Además, el servicio usa credenciales privilegiadas del servidor. Por ello cada herramienta debe volver a comprobar actor, membership activa, workspace, entitlement y alcance del objeto; nunca basta con ocultar un botón en la interfaz.

### 1.5 El editor ya contiene casi todos los destinos de la IA

`content-editor.tsx` ya mantiene estados para Hook, Desarrollo, Cierre, CTA, bullets, enlaces/referencias, iluminación, música y notas. La generación debe rellenar esos estados locales, no escribir directamente en BD. El usuario revisa, edita y pulsa Guardar.

### 1.6 El dashboard actual es exclusivamente de WhatsApp

`src/app/(main)/dashboard/page.tsx` bloquea por completo el dashboard cuando `whatsapp_agent_enabled=false`. Cuando está disponible, siempre carga métricas, conversaciones recientes, volumen de mensajes y estados de conversación. `DashboardMetrics` siempre prioriza derivaciones, mensajes y acceso al Inbox.

Esto deja al paquete Gestión sin panel principal útil y muestra información irrelevante cuando un producto o add-on no está contratado. El dashboard debe convertirse en un compositor por entitlements: misma identidad visual y estructura base, pero contenido, consultas y prioridades adaptados al paquete y a los extras activos.

---

## 2. Modelo comercial canónico

### 2.1 Paquete principal

Crear una fuente de verdad canónica en `workspaces`, preferiblemente `product_package`, con estos valores:

- `none`
- `gestion`
- `whatsapp_gestion`
- `suite`

Usar enum o `text` con `CHECK`, siguiendo la convención del repositorio. Los booleanos existentes pueden conservarse temporalmente por compatibilidad, pero deben derivarse de una única operación de cambio de paquete.

### 2.2 Matriz exacta

| Capacidad | Gestión | WhatsApp + Gestión | Suite |
|---|---:|---:|---:|
| Clientes | Sí | Sí | Sí |
| Oportunidades `/pipeline` | Sí | Sí | Sí |
| Proyectos | Sí | Sí | Sí |
| Tareas y subtareas | Sí | Sí | Sí |
| Agenda | Sí | Sí | Sí |
| Board | Sí | Sí | Sí |
| Anotaciones | Sí | Sí | Sí |
| Contenido completo | Sí | Sí | Sí |
| Agente WhatsApp / Conversaciones | No | Sí | Sí |
| Oficina Virtual | No | No | Sí |
| Asistente informativo | Sí | Sí | Sí |
| Acciones del asistente de gestión | No | Sí | Sí |

En Suite se habilita la **superficie** Oficina Virtual, pero solo aparecen agentes reales que hayan sido configurados y activados. No crear ni activar trabajadores ficticios en la oficina operativa.

### 2.3 Extras que nunca debe tocar el paquete

Estos productos siguen siendo add-ons independientes y no se activan ni desactivan al cambiar de paquete:

- Chat de equipo, incluyendo sus plazas y almacenamiento.
- Vapi/voz y `vapi_assistant_id`.
- Memoria avanzada.
- Memoria compartida/cross-channel.
- Recuperación de leads fríos.
- Cualquier cuota, configuración o proveedor externo asociado a estos extras.

Mantener también **Pipeline con IA** separado del acceso normal a Oportunidades, salvo que producto decida expresamente incluirlo después. No confundir el módulo `/pipeline`, que sí va incluido, con funciones inteligentes adicionales del pipeline.

### 2.4 Cambio atómico y downgrade seguro

Crear una única mutación autorizada para superadministrador, por ejemplo `set_workspace_product_package(workspace_id, package)`, ejecutada en una transacción. Debe:

1. bloquear/leer la fila de workspace;
2. validar el valor y el actor;
3. calcular todos los flags incluidos;
4. escribir paquete y flags en una sola transacción;
5. no tocar add-ons;
6. registrar auditoría con estado anterior y posterior;
7. devolver el estado canónico completo.

Dependencias mínimas de BD:

- WhatsApp implica Gestión.
- Suite implica Oficina + WhatsApp + Gestión.
- Las acciones del asistente solo son comerciales en `whatsapp_gestion` o `suite`.

Al bajar de paquete se ocultan/deshabilitan superficies, pero se conservan todos los datos y configuraciones. La UI debe mostrar una confirmación con lo que dejará de estar accesible. Nunca ejecutar deletes.

### 2.5 Migración de clientes existentes

Hacer primero una consulta de diagnóstico y pruebas. Backfill propuesto:

- Gestión solamente -> `gestion`.
- WhatsApp + Gestión sin oficina -> `whatsapp_gestion`.
- Oficina + WhatsApp + Gestión -> `suite`.
- Sin esos productos -> `none`.

Los estados históricos incoherentes —por ejemplo Oficina sin WhatsApp— no se deben corregir silenciosamente. La migración debe conservarlos o abortar con un informe para resolverlos deliberadamente.

### 2.6 Interfaz del superadministrador

En Ajustes > Negocio > Productos del cliente, añadir tres tarjetas de paquete y una de “sin paquete”, con:

- nombre, descripción corta y lista de incluidos;
- estado actual visible;
- un solo botón `Activar paquete`;
- resumen de cambios antes de confirmar;
- estado de carga único, éxito y error;
- aviso “WhatsApp requiere configuración” cuando corresponda.

Los interruptores existentes pueden conservarse debajo para diagnóstico/excepciones, pero deben diferenciar visualmente:

- **Incluido por el paquete**: bloqueado o sincronizado con el paquete.
- **Extra contratado**: editable individualmente.

No usar `hasWhatsappAgent` como sustituto genérico de “modo completo”. Crear un resolvedor compartido de entitlements, usado por servidor, navegación, ajustes y asistente.

---

## 3. Navegación visual

### 3.1 Oportunidades

- Mantener `/pipeline` exactamente como módulo independiente y la entrada lateral **Oportunidades**.
- Eliminar `pipeline` de los `VALID_VIEWS`, props, imports, consultas y pestañas de Proyectos.
- Los enlaces antiguos `/proyectos?view=pipeline` deben redirigir a `/pipeline` para no romper favoritos. Preservar parámetros útiles como `openDeal` o `createFor` cuando existan.
- Actualizar prompt, enlaces internos y tests del asistente para usar `/pipeline`.

### 3.2 Biblioteca de Proyectos

Patrón de URL recomendado:

- `/proyectos`: biblioteca visual.
- `/proyectos?view=projects`
- `/proyectos?view=tasks`
- `/proyectos?view=agenda`
- `/proyectos?view=board`
- `/proyectos?view=notes`

La biblioteca muestra tarjetas compactas para Proyectos, Tareas, Agenda, Board y Anotaciones. Cada tarjeta lleva icono, nombre, una frase y, si ya existe de forma barata, un contador útil. No incluir Oportunidades.

Al entrar en una herramienta:

- ocultar la barra/pestañas;
- usar todo el ancho disponible;
- mostrar arriba una flecha “Volver a herramientas de Proyectos”;
- mantener URL profunda y navegación del navegador;
- no perder filtros o selección por una rerenderización innecesaria.

### 3.3 Biblioteca de Contenido

Patrón:

- `/contenido`: biblioteca visual.
- `/contenido?view=ideas`
- `/contenido?view=pipeline`
- `/contenido?view=scripts`

Orden de las tarjetas y de cualquier selector residual:

1. Ideas
2. Pipeline
3. Guiones
4. Resto de herramientas futuras

La vista inicial pasa a ser la biblioteca, no Pipeline. Dentro de una herramienta se ocultan las pestañas y aparece la flecha de retorno. Corregir el retorno rígido del editor, que ahora apunta a `view=pipeline`; usar `returnTo` validado o un destino coherente como Guiones/biblioteca.

### 3.4 Criterios visuales y de interacción

- Reutilizar tokens, radios y colores actuales; no crear otro lenguaje visual.
- Escritorio: grid compacto; móvil: una columna y targets táctiles de 44 px.
- Foco visible, teclado, `aria-label` en flechas y estados vacíos claros.
- Las tarjetas no disponibles no deben prometer funciones no contratadas.
- No cargar de antemano datos pesados de todas las herramientas si solo se abre la biblioteca; cargar por vista.

---

## 4. Dashboard adaptativo por paquete y add-ons

### 4.1 Principio de composición

No crear tres páginas copiadas ni un gran componente con decenas de condicionales. Crear un modelo común de dashboard, por ejemplo `resolveDashboardCapabilities(entitlements)`, y bloques independientes que se consultan/renderizan únicamente cuando corresponden.

El dashboard mantiene en todos los paquetes:

- cabecera y lenguaje visual OnyxLink;
- prioridades del día;
- indicadores principales;
- acciones rápidas;
- actividad reciente útil.

Lo que cambia son los datos, textos, orden y bloques. El usuario nunca debe ver tarjetas vacías de WhatsApp, Vapi, Oficina o Chat si no ha contratado esas capacidades.

### 4.2 Dashboard de Gestión

Objetivo: dirigir el trabajo diario, no las conversaciones.

Prioridades recomendadas:

1. tareas vencidas y tareas para hoy;
2. próximos eventos de Agenda;
3. oportunidades que llevan demasiado tiempo sin movimiento;
4. proyectos con riesgo, bloqueados o próximos a fecha límite;
5. contenido pendiente de producir/publicar.

Indicadores:

- proyectos activos;
- progreso medio o tareas completadas esta semana;
- tareas pendientes/vencidas;
- valor y número de oportunidades abiertas;
- piezas de contenido en producción, si cabe en el diseño.

Acciones rápidas:

- crear tarea;
- crear proyecto;
- crear oportunidad;
- añadir idea de contenido;
- abrir Agenda.

No consultar ni mostrar Inbox, derivaciones, volumen de mensajes, estados de conversación, configuración de agentes WhatsApp o Vapi.

### 4.3 Dashboard de WhatsApp + Gestión

Objetivo: combinar atención comercial inmediata con ejecución interna.

Orden de prioridad:

1. conversaciones derivadas a humano y mensajes sin atender;
2. tareas vencidas/de hoy;
3. oportunidades calientes o sin seguimiento;
4. agenda próxima;
5. actividad de contenido/proyectos.

Indicadores combinados:

- conversaciones activas y pendientes;
- mensajes gestionados hoy;
- tareas pendientes/vencidas;
- oportunidades abiertas o valor del pipeline.

Mantener gráficos de WhatsApp actuales cuando haya datos, pero no permitir que ocupen todo el dashboard. Añadir accesos a Inbox, nueva tarea, oportunidad, proyecto y contenido. Mostrar “configuración pendiente” si el paquete habilita WhatsApp pero el proveedor/agente aún no está listo; no fingir actividad ni presentar ceros como si estuviera operativo.

### 4.4 Dashboard de Suite

Objetivo: centro de mando completo con actividad humana/digital.

Debe contener lo del dashboard WhatsApp + Gestión y añadir, sin duplicar información:

- resumen compacto de la Oficina Virtual: agentes configurados, activos, trabajando, esperando intervención y tareas recientes;
- acceso principal `Abrir oficina`;
- alertas operativas reales de especialistas, nunca agentes ficticios;
- estado de integraciones esenciales cuando exista una incidencia real.

La escena 3D no se carga dentro del dashboard. Usar un resumen ligero para no penalizar memoria, GPU, carga inicial ni móvil.

### 4.5 Add-ons que enriquecen sin cambiar el paquete

Los extras añaden widgets solo cuando están contratados y configurados:

- **Chat de equipo:** no sustituye ningún bloque; añade mensajes internos no leídos/menciones y acceso al Chat.
- **Vapi:** añade llamadas recientes, llamadas que requieren revisión y acceso al asistente de voz. Si existe contrato pero falta configuración, mostrar una única tarjeta de preparación, solo a roles autorizados.
- **Memoria avanzada/compartida:** no necesita una tarjeta protagonista permanente. Mostrar estado o valor únicamente donde sea accionable; nunca contenido sensible de memoria en el resumen.
- **Leads fríos:** añade candidatos y recuperaciones pendientes dentro del área comercial, no un dashboard alternativo.
- **Pipeline IA:** puede enriquecer las prioridades de oportunidades, pero no condiciona la existencia del pipeline normal.

Un add-on desactivado no deja hueco, tarjeta bloqueada ni llamada comercial invasiva en el dashboard del cliente. Las ampliaciones se gestionan desde Ajustes/superadministración.

### 4.6 Roles y personalización responsable

Primero adaptar por paquete; después, cuando el modelo de roles lo permita, ordenar las mismas capacidades según el rol. No ocultar una obligación crítica solo por personalización.

- propietario/administrador: visión global y configuración;
- miembro: sus tareas, agenda, proyectos y conversaciones asignadas;
- usuario sin permiso de configuración: no mostrar acciones `Configurar agentes` ni avisos técnicos que no puede resolver.

Todos los contadores deben respetar los mismos permisos que sus páginas de destino.

### 4.7 Rendimiento y consultas

- Resolver paquete y add-ons una vez en servidor mediante el resolvedor compartido.
- Ejecutar solo las consultas requeridas por los bloques activos; no cargar métricas de WhatsApp para Gestión.
- Paralelizar consultas independientes y limitar listas recientes.
- Evitar una consulta por tarjeta; crear agregados workspace-scoped o RPCs seguras cuando aporte valor.
- Usar skeletons coherentes si algún bloque se difiere, sin saltos grandes de layout.
- No importar Three.js desde el dashboard.
- Mantener `force-dynamic` si los datos son operativos, pero revisar caché por usuario/workspace para impedir filtraciones.

### 4.8 Estados y textos

Diferenciar expresamente:

- **No contratado:** el bloque no existe.
- **Contratado sin configurar:** onboarding breve y accionable para quien tenga permiso.
- **Configurado sin actividad:** estado vacío útil.
- **Con actividad:** métricas y prioridades reales.
- **Error operativo:** aviso concreto y acceso a resolución.

No usar el mismo “0 mensajes” para todos esos estados.

### 4.9 Criterios de aceptación del dashboard

- Gestión entra en `/dashboard` y recibe un panel completo de trabajo, sin referencias a mensajes o voz.
- WhatsApp + Gestión recibe un panel combinado, no exclusivamente de mensajería.
- Suite recibe resumen operativo de oficina basado solo en agentes configurados.
- Vapi y Chat aparecen únicamente como add-ons activos/configurados.
- Desactivar un add-on elimina su widget sin romper el grid.
- No se realizan consultas de módulos no contratados.
- Acceso directo, navegación lateral y dashboard consumen el mismo resolvedor de entitlements.
- Escritorio y móvil mantienen jerarquía, sin tarjetas vacías ni grandes huecos.

---

## 5. Generar guion con IA

### 5.1 UX exacta

En crear y editar Guion, colocar a la izquierda del botón actual **Estructuras de guion** un botón **Generar guion con IA**. No modificar el comportamiento del botón de estructuras.

Entrada tomada del bloque General:

- descripción o idea principal;
- tipo de contenido;
- red social;
- duración;
- formato/orientación;
- responsable;
- fecha prevista.

Salida estructurada:

- Hook;
- Desarrollo;
- Cierre;
- CTA;
- Bullet points;
- Referencias y enlaces solo cuando sean necesarios y verificables;
- luces recomendadas;
- música recomendada;
- notas adicionales solo cuando aporten valor.

La respuesta se coloca en el estado local de cada campo. No guardar automáticamente. Tras generar, enfocar el primer campo generado y mostrar un mensaje discreto indicando que todo es editable.

### 5.2 Protección contra sustitución

Antes de llamar a la IA, detectar si alguno de los campos destino contiene información. Si ocurre, abrir diálogo con la lista de campos afectados:

- `Cancelar`;
- `Sustituir contenido existente`.

No borrar nada antes de la confirmación. Si la llamada falla, conservar exactamente el borrador previo. Para esta primera versión no implementar mezclas automáticas ambiguas.

### 5.3 Arquitectura segura

- Acción/ruta solo de servidor.
- Validar sesión, membership activa, mismo workspace y entitlement de Gestión.
- No aceptar `workspace_id` libre sin contrastarlo con la sesión.
- Validar entrada y salida con Zod y respuesta JSON estructurada.
- Claves de OpenRouter exclusivamente en servidor; nunca en payload ni cliente.
- Timeout, límite de tokens, rate limit por workspace/usuario y logs sin contenido sensible.
- El responsable debe pertenecer al workspace; si no, rechazar.
- No registrar el texto completo del guion en logs técnicos.
- La generación no muta `content_items`; solo devuelve propuesta.

No permitir que el modelo invente URLs o fuentes. Si no hay navegación/fuentes verificadas, devolver `links: []`. Si la idea incluye enlaces reales, se pueden conservar; cualquier investigación web futura debe ser otra capacidad explícita con fuentes verificables.

### 5.4 Crear y editar sin duplicar lógica

Extraer un formulario/editor compartido para ambos flujos. Si todavía no existe una creación completa de guion, añadir una entrada clara `Nuevo guion` que abra el formulario en modo crear, o crear el registro mínimo y abrir el mismo editor. No mantener dos implementaciones distintas del botón IA.

### 5.5 Esquema orientativo de respuesta

```ts
const GeneratedScriptSchema = z.object({
  hook: z.string(),
  body: z.string(),
  closing: z.string(),
  cta: z.string(),
  bulletPoints: z.array(z.string()),
  links: z.array(z.object({ label: z.string(), url: z.string().url() })),
  lighting: z.string(),
  music: z.string(),
  notes: z.string(),
});
```

Los campos opcionales conceptualmente se devuelven como cadena vacía/lista vacía para simplificar el relleno controlado del formulario.

---

## 6. Asistente adaptado a cada paquete

### 6.1 Comportamiento comercial

- `gestion`: asistente de soporte. Responde preguntas y explica cómo usar el panel, sin herramientas de escritura.
- `whatsapp_gestion`: asistente de gestión, con acciones internas permitidas.
- `suite`: el mismo asistente de gestión más contexto de la Oficina Virtual y capacidades de Suite que realmente existan.
- `none`: no ofrecer capacidades no contratadas.

Derivar este nivel del paquete canónico. Si se conserva un interruptor, que sea un **kill switch operativo** para suspender acciones, no una segunda fuente comercial contradictoria.

### 6.2 Inventario que falta implementar

Antes de declarar el asistente “completo”, añadir herramientas workspace-scoped para:

1. Agenda: buscar, crear, reprogramar, actualizar y cancelar eventos/tareas de agenda.
2. Anotaciones: buscar, crear, editar y archivar/eliminar con confirmación.
3. Contenido: buscar/crear ideas, editar General y guion, generar propuesta de guion, cambiar estado del pipeline y actualizar métricas.
4. Tareas/subtareas: crear, asignar, actualizar, completar y gestionar subtareas.
5. Board: buscar/crear/renombrar tableros y manipular notas, texto y conectores internos.

Para Board no importar Excalidraw en código de servidor. Crear un adaptador JSON pequeño, validado y server-safe sobre `scene_data`. Usar versión/`updated_at` para evitar que el asistente sobrescriba una edición simultánea del usuario. Cada elemento generado debe tener ID estable y coordenadas válidas; conectores deben referenciar elementos existentes.

No añadir acciones externas de WhatsApp, publicación o llamadas bajo la frase genérica “todo”. Esas acciones necesitan un diseño específico de consentimiento, destinatario y confirmación.

### 6.3 Niveles de riesgo

- Lectura/búsqueda: ejecución directa.
- Crear o editar datos internos reversibles: ejecución tras intención clara y resumen del resultado.
- Borrar, archivar en lote, publicar, enviar mensajes o cualquier acción externa: confirmación explícita inmediatamente anterior.

Todas las mutaciones deben tener:

- comprobación de membership y entitlement en el servidor;
- filtro `workspace_id` en lectura y escritura;
- validación de IDs relacionados dentro del mismo workspace;
- auditoría con actor, acción, entidad e ID, sin secretos;
- idempotencia para evitar duplicados en reintentos;
- límites de pasos/herramientas por conversación.

### 6.4 Fallo actual que hay que eliminar

El servicio crea un cliente Supabase con `service_role`. Antes de ejecutar cualquier herramienta, verificar que `actorUserId` tiene membership activa en `workspaceId`. Cada herramienta debe repetir el alcance sobre la entidad objetivo. Añadir pruebas negativas A/B: un usuario del workspace A nunca puede leer o mutar IDs del B aunque los conozca.

---

## 7. Orden de implementación

### Fase 1 — Navegación y limpieza visual

1. Eliminar Oportunidades de Proyectos y compatibilizar enlaces antiguos.
2. Crear biblioteca enfocada de Proyectos.
3. Crear biblioteca enfocada de Contenido en orden Ideas, Pipeline, Guiones.
4. Corregir enlaces, prompt y tests.

No tocar aún paquetes ni IA.

**Aceptación:** `/pipeline` conserva su comportamiento; no existe duplicación; las bibliotecas funcionan con teclado, móvil, deep links y botón volver.

### Fase 2 — Paquete canónico, Ajustes y dashboard adaptativo

1. Diagnóstico de estados históricos.
2. Migración local, constraints y backfill seguro.
3. Mutación atómica y auditoría.
4. Resolvedor compartido de entitlements.
5. Tarjetas de paquetes y separación visual de add-ons.
6. Gates de servidor y navegación basados en el resolvedor.
7. Compositor de dashboard y variantes Gestión, WhatsApp + Gestión y Suite.
8. Widgets condicionales de add-ons, sin consultas innecesarias.

**Aceptación:** activar cada paquete produce exactamente la matriz y su dashboard correspondiente; un fallo revierte todo; Chat/Vapi/memorias/cold leads no cambian; sus widgets solo aparecen cuando corresponden; downgrade no borra datos; clientes A/B aislados.

### Fase 3 — IA de guiones

1. Editor compartido crear/editar.
2. Endpoint de generación estructurada.
3. Botón, carga, error y confirmación de sustitución.
4. Relleno local editable y guardado manual.
5. Tests de permisos, esquema, fallo y no sobrescritura.

**Aceptación:** el botón aparece a la izquierda de Estructuras en ambos flujos; nunca autoguarda; no inventa enlaces; no sustituye nada sin confirmar.

### Fase 4 — Asistente de gestión completo

Implementar por dominios pequeños: Agenda, Anotaciones, Contenido, tareas/subtareas y finalmente elementos internos de Board. Añadir una matriz automática de herramientas por paquete y un kill switch.

**Aceptación:** Gestión no recibe tools; WhatsApp+Gestión y Suite reciben solo tools contratadas; aislamiento A/B y confirmaciones destructivas probadas; el prompt no afirma capacidades inexistentes.

---

## 8. Pruebas obligatorias

En cada fase ejecutar al menos:

```bash
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Además:

- pruebas unitarias de la matriz de entitlements;
- snapshot/estructura y consultas ejecutadas para cada variante de dashboard;
- estados no contratado, pendiente de configurar, vacío, activo y error;
- transacción/rollback y downgrade sin borrado;
- acceso directo a URL no contratada bloqueado en servidor;
- RLS y service-role con workspace A/B;
- enlaces antiguos de Proyectos a `/pipeline`;
- orden y retorno de bibliotecas;
- IA: salida inválida, timeout, campos existentes, cancelación y propuesta sin autosave;
- asistente: lista exacta de herramientas por paquete y rechazo de IDs ajenos;
- revisión visual escritorio y móvil, consola limpia.

No afirmar que algo está listo por pasar el build: documentar las pruebas funcionales reales realizadas.

---

## 9. Decisiones que no debe improvisar Claude

Si surge cualquiera de estos casos, detenerse y solicitar decisión:

- estado histórico Oficina activada sin WhatsApp/Gestión;
- proveedor/cuenta exacta que pagará la generación de guiones si no está ya definido por configuración;
- activación automática de `chatbot_enabled` dentro de Suite si su significado comercial actual no es inequívoco;
- acciones externas del asistente (enviar WhatsApp, publicar contenido, iniciar llamadas);
- eliminación física de datos al bajar de plan, que queda expresamente prohibida.

---

## 10. Formato de entrega por fase

Entregar:

1. resumen funcional breve;
2. archivos modificados;
3. migraciones y política de rollback;
4. pruebas ejecutadas con resultado;
5. riesgos o decisiones pendientes;
6. `git status` exacto;
7. detenerse sin commit/push/deploy salvo autorización.

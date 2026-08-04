import type { NoteContent, NoteTemplateId } from "@/features/projects/types";

export interface NoteTemplateDef {
  id: NoteTemplateId;
  label: string;
  description: string;
  content: NoteContent;
}

function heading(level: 1 | 2 | 3, text: string) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function paragraph(text = "") {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}
function bulletList(items: string[]) {
  return {
    type: "bulletList",
    content: items.map((text) => ({
      type: "listItem",
      content: [paragraph(text)],
    })),
  };
}

export const NOTE_TEMPLATES: NoteTemplateDef[] = [
  {
    id: "blank",
    label: "Documento en blanco",
    description: "Empieza desde cero",
    content: { type: "doc", content: [paragraph()] },
  },
  {
    id: "meeting",
    label: "Reunión",
    description: "Agenda, asistentes y acuerdos",
    content: {
      type: "doc",
      content: [
        heading(1, "Reunión"),
        paragraph("Fecha: "),
        paragraph("Asistentes: "),
        heading(2, "Agenda"),
        bulletList(["Tema 1", "Tema 2"]),
        heading(2, "Acuerdos"),
        bulletList(["Acuerdo 1"]),
      ],
    },
  },
  {
    id: "brief",
    label: "Brief",
    description: "Contexto, objetivo y entregables",
    content: {
      type: "doc",
      content: [
        heading(1, "Brief"),
        heading(2, "Contexto"),
        paragraph(),
        heading(2, "Objetivo"),
        paragraph(),
        heading(2, "Entregables"),
        bulletList(["Entregable 1"]),
      ],
    },
  },
  {
    id: "proposal",
    label: "Propuesta",
    description: "Resumen, alcance e inversión",
    content: {
      type: "doc",
      content: [
        heading(1, "Propuesta"),
        heading(2, "Resumen"),
        paragraph(),
        heading(2, "Alcance"),
        bulletList(["Punto 1"]),
        heading(2, "Inversión"),
        paragraph(),
      ],
    },
  },
  {
    id: "procedure",
    label: "Procedimiento",
    description: "Pasos numerados para repetir un proceso",
    content: {
      type: "doc",
      content: [
        heading(1, "Procedimiento"),
        paragraph("Objetivo: "),
        heading(2, "Pasos"),
        { type: "orderedList", content: [{ type: "listItem", content: [paragraph("Paso 1")] }] },
      ],
    },
  },
  {
    id: "project_plan",
    label: "Plan de proyecto",
    description: "Alcance, hitos y responsables",
    content: {
      type: "doc",
      content: [
        heading(1, "Plan de proyecto"),
        heading(2, "Alcance"),
        paragraph(),
        heading(2, "Hitos"),
        bulletList(["Hito 1"]),
        heading(2, "Responsables"),
        paragraph(),
      ],
    },
  },
  {
    id: "quick_notes",
    label: "Notas rápidas",
    description: "Lista simple, sin estructura fija",
    content: { type: "doc", content: [bulletList([""])] },
  },
  {
    id: "report",
    label: "Informe",
    description: "Resumen, hallazgos y próximos pasos",
    content: {
      type: "doc",
      content: [
        heading(1, "Informe"),
        heading(2, "Resumen"),
        paragraph(),
        heading(2, "Hallazgos"),
        bulletList(["Hallazgo 1"]),
        heading(2, "Próximos pasos"),
        bulletList(["Paso 1"]),
      ],
    },
  },
];

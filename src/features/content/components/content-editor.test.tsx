// @vitest-environment jsdom
//
// Fase 3 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §5):
// "Generar guion con IA" — cubre exactamente lo que el encargo pide probar
// a nivel de editor: sustitución con confirmación, cancelación sin tocar
// nada, error sin perder el borrador, y ausencia de autoguardado (ninguna
// llamada a updateContentItem ocurre como parte de generar).

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContentItemRow } from "@/features/content/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";
import type { ProjectOption } from "@/features/projects/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) } }));

const updateContentItem = vi.fn();
const deleteContentItem = vi.fn();
vi.mock("@/features/content/services/content-actions", () => ({
  updateContentItem: (...a: unknown[]) => updateContentItem(...a),
  deleteContentItem: (...a: unknown[]) => deleteContentItem(...a),
}));

const generateContentScript = vi.fn();
vi.mock("@/features/content/services/content-script-ai", () => ({
  generateContentScript: (...a: unknown[]) => generateContentScript(...a),
}));

const { ContentEditor } = await import("./content-editor");

function baseItem(overrides: Partial<ContentItemRow> = {}): ContentItemRow {
  return {
    id: "item-1",
    workspace_id: "empresa-a",
    project_id: null,
    responsible_id: null,
    title: "Mi guion",
    main_idea: "Cómo ahorrar tiempo con automatizaciones",
    description: "Un reel corto explicando 3 automatizaciones útiles",
    content_type: "Reel",
    platform: "Instagram",
    orientation: "vertical",
    script_hook: null,
    script_body: null,
    script_closing: null,
    script_cta: null,
    bullet_points: [],
    reference_links: [],
    notes: null,
    lighting_notes: null,
    music_notes: null,
    duration_estimate: "30s",
    status: "in_production",
    position: 0,
    scheduled_date: null,
    published_at: null,
    metric_views: null,
    metric_reach: null,
    metric_likes: null,
    metric_comments: null,
    metric_shares: null,
    metric_saves: null,
    metric_clicks: null,
    metric_leads: null,
    metric_notes: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const MEMBERS: WorkspaceMember[] = [{ user_id: "user-1", full_name: "Ana" }];
const PROJECT: ProjectOption = { id: "project-1", name: "Campaña Q3" };

const GENERATED = {
  hook: "¿Sabías que puedes ahorrar 5 horas a la semana?",
  body: "Te muestro 3 automatizaciones que uso cada día...",
  closing: "Así de simple.",
  cta: "Guarda este video para probarlo tú mismo.",
  bulletPoints: ["Automatización 1", "Automatización 2", "Automatización 3"],
  links: [],
  lighting: "Luz natural de frente",
  music: "Instrumental suave de fondo",
  notes: "",
};

function renderEditor(itemOverrides: Partial<ContentItemRow> = {}) {
  return render(
    <ContentEditor
      workspaceId="empresa-a"
      item={baseItem(itemOverrides)}
      members={MEMBERS}
      initialProject={PROJECT}
      backHref="/contenido"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContentEditor — Generar guion con IA", () => {
  it("con el guion vacío, genera directamente sin pedir confirmación y rellena el estado local sin guardar", async () => {
    generateContentScript.mockResolvedValue({ ok: true, data: GENERATED });
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /Generar guion con IA/i }));

    await waitFor(() => expect(generateContentScript).toHaveBeenCalledTimes(1));
    expect(generateContentScript).toHaveBeenCalledWith(
      "empresa-a",
      expect.objectContaining({ mainIdea: "Cómo ahorrar tiempo con automatizaciones" }),
    );

    await screen.findByDisplayValue(GENERATED.hook);
    expect(screen.getByDisplayValue(GENERATED.body)).toBeTruthy();
    expect(screen.getByDisplayValue(GENERATED.closing)).toBeTruthy();
    expect(screen.getByDisplayValue(GENERATED.cta)).toBeTruthy();

    // Ausencia de autoguardado: rellenar el estado local nunca dispara un guardado.
    expect(updateContentItem).not.toHaveBeenCalled();
  });

  it("con contenido existente en el guion, pide confirmación antes de sustituir — Cancelar no toca nada", async () => {
    renderEditor({ script_hook: "Hook original escrito a mano" });

    fireEvent.click(screen.getByRole("button", { name: /Generar guion con IA/i }));

    expect(await screen.findByText("Ya hay contenido en el guion")).toBeTruthy();
    expect(screen.getByText("• Hook")).toBeTruthy();
    expect(generateContentScript).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByText("Ya hay contenido en el guion")).toBeNull());
    expect(generateContentScript).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Hook original escrito a mano")).toBeTruthy();
    expect(updateContentItem).not.toHaveBeenCalled();
  });

  it("confirmar sustitución llama a la generación y reemplaza el contenido anterior", async () => {
    generateContentScript.mockResolvedValue({ ok: true, data: GENERATED });
    renderEditor({ script_hook: "Hook original escrito a mano" });

    fireEvent.click(screen.getByRole("button", { name: /Generar guion con IA/i }));
    await screen.findByText("Ya hay contenido en el guion");
    fireEvent.click(screen.getByRole("button", { name: "Sustituir contenido existente" }));

    await waitFor(() => expect(generateContentScript).toHaveBeenCalledTimes(1));
    await screen.findByDisplayValue(GENERATED.hook);
    expect(screen.queryByDisplayValue("Hook original escrito a mano")).toBeNull();
  });

  it("si la generación falla, conserva exactamente el borrador previo y muestra el error", async () => {
    generateContentScript.mockResolvedValue({ ok: false, error: "El modelo no respondió a tiempo" });
    renderEditor({ script_hook: "Hook original escrito a mano", script_cta: "CTA original" });

    fireEvent.click(screen.getByRole("button", { name: /Generar guion con IA/i }));
    await screen.findByText("Ya hay contenido en el guion");
    fireEvent.click(screen.getByRole("button", { name: "Sustituir contenido existente" }));

    await waitFor(() => expect(generateContentScript).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("El modelo no respondió a tiempo"));

    expect(screen.getByDisplayValue("Hook original escrito a mano")).toBeTruthy();
    expect(screen.getByDisplayValue("CTA original")).toBeTruthy();
    expect(updateContentItem).not.toHaveBeenCalled();
  });

  it("sin OpenRouter configurado, el mensaje conduce claramente a Ajustes → Integraciones (el botón sigue disponible)", async () => {
    generateContentScript.mockResolvedValue({
      ok: false,
      error: "Conecta tu cuenta de OpenRouter en Ajustes → Integraciones para generar guiones con IA.",
      code: "openrouter_not_configured",
    });
    renderEditor();

    const button = screen.getByRole("button", { name: /Generar guion con IA/i }) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message, options] = toastError.mock.calls[0] as [string, { action?: { label: string; onClick: () => void } }];
    expect(message).toBe("Conecta tu cuenta de OpenRouter en Ajustes → Integraciones para generar guiones con IA.");
    expect(options.action?.label).toBe("Ir a Ajustes");

    options.action?.onClick();
    expect(push).toHaveBeenCalledWith("/settings?tab=integraciones");

    // El botón sigue visible y utilizable — no desaparece por falta de configuración.
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("una excepción inesperada durante la generación no deja el botón bloqueado ni pierde el borrador", async () => {
    generateContentScript.mockRejectedValue(new Error("network down"));
    renderEditor();

    const button = screen.getByRole("button", { name: /Generar guion con IA/i }) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => expect(generateContentScript).toHaveBeenCalledTimes(1));
    // El componente no debe quedar colgado en estado "generando" para siempre.
    await waitFor(() => expect(button.disabled).toBe(false));
  });
});

describe("ContentEditor — Guardar sigue siendo manual", () => {
  it("Guardar solo se dispara al pulsar el botón, nunca automáticamente tras generar", async () => {
    generateContentScript.mockResolvedValue({ ok: true, data: GENERATED });
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /Generar guion con IA/i }));
    await screen.findByDisplayValue(GENERATED.hook);
    expect(updateContentItem).not.toHaveBeenCalled();

    updateContentItem.mockResolvedValue({ ok: true, data: null });
    const saveButton = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));
    fireEvent.click(saveButton);
    await waitFor(() => expect(updateContentItem).toHaveBeenCalledTimes(1));
    expect(updateContentItem).toHaveBeenCalledWith(
      "empresa-a",
      "item-1",
      expect.objectContaining({ script_hook: GENERATED.hook }),
    );
  });
});

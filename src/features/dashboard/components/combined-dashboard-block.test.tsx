// @vitest-environment jsdom
//
// Dashboard navegable — Fase 1: cada indicador del bloque combinado
// (WhatsApp+Gestión / Suite) navega exactamente al destino pedido. El
// dashboard NO cambia visualmente (cero ediciones de JSX en este archivo)
// — estas pruebas solo documentan y protegen los hrefs ya existentes.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CombinedDashboardBlock } from "./combined-dashboard-block";
import type { WorkspaceMetrics, RecentConversation, MessageVolumePoint, ConversationStateCount } from "@/features/dashboard/services/metrics";
import type { GestionMetrics, UpcomingAgendaItem, StalledDeal } from "@/features/dashboard/services/gestion-metrics";
import type { WhatsappDashboardState } from "@/features/dashboard/services/whatsapp-status";

afterEach(() => {
  cleanup();
});

const metrics: WorkspaceMetrics = { messagesToday: 12, activeConversations: 4, handoffPending: 2, llmCostWeekUsd: 1.2, templatesSentWeek: 0 };
const gestionMetrics: GestionMetrics = {
  tasksOverdue: 3, tasksToday: 1, tasksPending: 8, agendaUpcoming: 2, dealsOpenCount: 5, dealsOpenValue: 1000,
  dealsStalledCount: 1, projectsActiveCount: 2, projectsAvgProgress: 50, contentPendingCount: 4,
};
const upcomingAgenda: UpcomingAgendaItem[] = [{ id: "ag1", title: "Llamada con cliente", due_at: "2026-08-10T10:00:00Z" }];
const stalledDeals: StalledDeal[] = [{ id: "d1", title: "Oportunidad estancada", stage: "interes", updated_at: "2026-08-01T00:00:00Z" }];
const recentConversations: RecentConversation[] = [
  { id: "c1", contactName: "Ana Ruiz", contactPhone: "+34600000000", lastMessagePreview: "Hola", state: "handoff_pending", lastMessageAt: "2026-08-09T00:00:00Z" },
];
const messageVolume: MessageVolumePoint[] = [];
const conversationStates: ConversationStateCount[] = [];
const whatsappStatus: WhatsappDashboardState = { status: "active", detail: null };

function renderBlock(overrides: Partial<Parameters<typeof CombinedDashboardBlock>[0]> = {}) {
  render(
    <CombinedDashboardBlock
      whatsapp={{ metrics, recentConversations, messageVolume, conversationStates }}
      whatsappStatus={whatsappStatus}
      canConfigureWhatsapp={true}
      gestion={{ metrics: gestionMetrics, upcomingAgenda, stalledDeals }}
      office={{ configuredCount: 2 }}
      addons={{ teamChatUnread: 1, vapiRecentCalls: null }}
      {...overrides}
    />,
  );
}

describe("CombinedDashboardBlock — navegación de cada indicador", () => {
  it("conversaciones esperando a una persona (handoff) → /inbox", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /esperando a una persona/ });
    expect(link.getAttribute("href")).toBe("/inbox");
  });

  it("tareas vencidas → /proyectos?view=tasks", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /tarea.*vencida/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
  });

  it("conversaciones activas → /inbox", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /en marcha/ });
    expect(link.getAttribute("href")).toBe("/inbox");
  });

  it("oportunidad estancada (cliente pendiente de seguimiento) → /pipeline", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Oportunidad estancada/ });
    expect(link.getAttribute("href")).toBe("/pipeline");
  });

  it("próximo evento de agenda → /proyectos?view=agenda", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Llamada con cliente/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=agenda");
  });

  it("contenido pendiente → /contenido", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /contenido.*pendiente/ });
    expect(link.getAttribute("href")).toBe("/contenido");
  });

  it("KPI Mensajes de hoy → /inbox", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Mensajes de hoy/ });
    expect(link.getAttribute("href")).toBe("/inbox");
  });

  it("KPI Chats abiertos → /inbox", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Chats abiertos/ });
    expect(link.getAttribute("href")).toBe("/inbox");
  });

  it("KPI Tareas pendientes → /proyectos?view=tasks", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Tareas pendientes/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
  });

  it("KPI Oportunidades abiertas → /pipeline", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Oportunidades abiertas/ });
    expect(link.getAttribute("href")).toBe("/pipeline");
  });

  it("fila de conversación reciente → /inbox/{id}, toda la fila es UN único enlace (sin anidar)", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Ana Ruiz/ });
    expect(link.getAttribute("href")).toBe("/inbox/c1");
    // Nunca debe haber un <a> anidado dentro del propio <a> de la fila.
    expect(link.querySelector("a")).toBeNull();
  });

  it("Oficina Virtual (Suite) → /oficina-virtual", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Abrir oficina/ });
    expect(link.getAttribute("href")).toBe("/oficina-virtual");
  });

  it("Chat de equipo pendiente (add-on) → /chat", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Chat de equipo/ });
    expect(link.getAttribute("href")).toBe("/chat");
  });

  it("QuickAction Ver conversaciones → /inbox", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Ver conversaciones/ });
    expect(link.getAttribute("href")).toBe("/inbox");
  });

  it("QuickAction Crear tarea → /proyectos?view=tasks", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Crear tarea/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
  });

  it("QuickAction Revisar ventas → /pipeline", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Revisar ventas/ });
    expect(link.getAttribute("href")).toBe("/pipeline");
  });

  it("ningún enlace queda anidado dentro de otro enlace en todo el bloque", () => {
    renderBlock();
    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelector("a")).toBeNull();
    }
  });
});

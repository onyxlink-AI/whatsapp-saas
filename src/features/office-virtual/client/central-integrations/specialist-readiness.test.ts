import { describe, expect, it } from 'vitest';
import { resolveSpecialistWorkSummary } from './specialist-readiness';
import { findSpecialistTemplate } from './specialist-templates';
import { REAL_INTEGRATION_LABELS } from './real-integrations';
import { SPECIALIST_EXTENSIONS } from './specialist-extensions';
import type { SpecialistDraftLike } from './specialist-readiness';

// gestor-de-empresa's capabilities (specialist-templates.ts):
//   - consulta-instrucciones: [] — intellectual only
//   - correo-organizacion: ['gmail-outlook'] — NOT a real integration
//   - correo-redaccion-envio: ['gmail-outlook'], sensitive — NOT a real integration
//   - presupuestos: ['catalogo-precios', 'programa-presupuestos'] — NOT real
//   - envio-facturas: ['facturacion-erp'] — NOT real
//   - crm-seguimiento: ['crm'] — maps to HighLevel
//   - revision-legal-basica: [] — intellectual only
const TEMPLATE = findSpecialistTemplate('gestor-de-empresa')!;

function draft(overrides: Partial<SpecialistDraftLike> = {}): SpecialistDraftLike {
  return {
    enabled: false,
    approvalPolicy: 'sensitive_only',
    name: 'Ana',
    function: 'Gestión',
    objective: 'Ayudar con el día a día',
    instructions: 'Trabaja dentro de lo permitido.',
    ...overrides,
  };
}

describe('resolveSpecialistWorkSummary — OpenRouter connected, no external tools', () => {
  it('can be activated, can do intellectual work, and every execution capability is blocked (never fully activation-blocking)', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, {}, []);

    expect(summary.status).toBe('active');
    expect(summary.attentionReason).toBeNull();

    const intellectual = summary.capabilities.filter((c) => c.intellectualOnly);
    expect(intellectual.length).toBeGreaterThan(0);
    for (const c of intellectual) expect(c.status).toBe('available');

    const execution = summary.capabilities.filter((c) => !c.intellectualOnly);
    expect(execution.length).toBeGreaterThan(0);
    for (const c of execution) expect(['missing_connection', 'not_available']).toContain(c.status);
  });

  it('would also be activatable while off (ready_to_help) — only OpenRouter and valid config gate activation', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: false }), true, {}, []);
    expect(summary.status).toBe('ready_to_help');
  });
});

describe('resolveSpecialistWorkSummary — OpenRouter absent', () => {
  it('cannot be activated, and the reason explains exactly how to fix it', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), false, {}, []);
    expect(summary.status).toBe('needs_attention');
    expect(summary.attentionReason).toMatch(/OpenRouter/);
    expect(summary.attentionReason).toMatch(/Ajustes/);
  });

  it('a specialist that was never even given a template stays "not_configured", not "needs_attention"', () => {
    const summary = resolveSpecialistWorkSummary(null, draft(), false, {}, []);
    expect(summary.status).toBe('not_configured');
    expect(summary.attentionReason).toBeNull();
    expect(summary.capabilities).toEqual([]);
  });
});

describe('resolveSpecialistWorkSummary — Google Calendar connected (via the agenda-reservas extension)', () => {
  it('makes the calendar-backed capabilities available, independent of every other integration', () => {
    const agendaExtension = SPECIALIST_EXTENSIONS.find((e) => e.id === 'agenda-reservas')!;

    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, { google_calendar: true }, [agendaExtension]);

    const availability = summary.capabilities.find((c) => c.capabilityId === 'consultar-disponibilidad');
    expect(availability?.status).toBe('available');
    const createAppointment = summary.capabilities.find((c) => c.capabilityId === 'crear-cita');
    // "crear-cita" is sensitive; default approvalPolicy is 'sensitive_only', which only blocks on 'always'.
    expect(createAppointment?.status).toBe('available');

    // The extension's WhatsApp-backed reminder capability is unaffected by calendar being connected.
    const reminder = summary.capabilities.find((c) => c.capabilityId === 'enviar-recordatorio');
    expect(reminder?.status).toBe('missing_connection');
    expect(reminder?.missingIntegrations).toEqual(['ycloud']);
  });

  it('needs_approval when the specialist requires approval on every sensitive action', () => {
    const agendaExtension = SPECIALIST_EXTENSIONS.find((e) => e.id === 'agenda-reservas')!;
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true, approvalPolicy: 'always' }), true, { google_calendar: true }, [agendaExtension]);
    const createAppointment = summary.capabilities.find((c) => c.capabilityId === 'crear-cita');
    expect(createAppointment?.status).toBe('needs_approval');
  });
});

describe('resolveSpecialistWorkSummary — HighLevel connected', () => {
  it('makes the CRM/pipeline capability available', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, { highlevel: true }, []);
    const crm = summary.capabilities.find((c) => c.capabilityId === 'crm-seguimiento');
    expect(crm?.status).toBe('available');
  });
});

describe('resolveSpecialistWorkSummary — a saved-but-disabled integration never counts as connected', () => {
  it('treats { highlevel: false } exactly like "not connected"', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, { highlevel: false }, []);
    const crm = summary.capabilities.find((c) => c.capabilityId === 'crm-seguimiento');
    expect(crm?.status).toBe('missing_connection');
    expect(crm?.missingIntegrations).toEqual(['highlevel']);
  });
});

describe('resolveSpecialistWorkSummary — none of the 38 generic connections ever reach the user', () => {
  it('a capability that needs an unsupported connector (Gmail, an ERP...) is "not_available", never asked to be "connected"', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, {}, []);
    const email = summary.capabilities.find((c) => c.capabilityId === 'correo-redaccion-envio');
    expect(email?.status).toBe('not_available');
    expect(email?.missingIntegrations).toEqual([]);

    const invoices = summary.capabilities.find((c) => c.capabilityId === 'envio-facturas');
    expect(invoices?.status).toBe('not_available');
  });

  it('the "Falta conectar" real-integration name is always one of the 5 real integrations, never a generic catalog id', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, {}, []);
    const REAL = ['OpenRouter', 'WhatsApp (YCloud)', 'HighLevel', 'Google Calendar', 'Airtable'];
    for (const capability of summary.capabilities) {
      for (const id of capability.missingIntegrations) {
        expect(['openrouter', 'ycloud', 'highlevel', 'google_calendar', 'airtable']).toContain(id);
      }
    }
    // Sanity: the label lookup used by the UI only ever resolves to these 5 names.
    expect(Object.values(REAL_INTEGRATION_LABELS).sort()).toEqual(REAL.sort());
  });
});

describe('resolveSpecialistWorkSummary — "Funciones conectadas: X de Y" never counts the 34 unimplemented connectors', () => {
  it('the denominator (Y) only counts capabilities OnyxLink actually offers, excluding not_available ones', () => {
    // gestor-de-empresa has 5 execution-tier capabilities total: correo-organizacion,
    // correo-redaccion-envio, presupuestos, envio-facturas (all gmail-outlook/ERP-backed,
    // i.e. not_available — OnyxLink doesn't implement any of them) and
    // crm-seguimiento (highlevel-backed — real). Y must be 1, never 5.
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, {}, []);
    const executionCapabilities = summary.capabilities.filter((c) => !c.intellectualOnly);
    expect(executionCapabilities).toHaveLength(5); // sanity: the template really has 5
    expect(summary.connectedTotal).toBe(1);
    expect(summary.offeredExecutionCapabilities).toHaveLength(1);
    expect(summary.offeredExecutionCapabilities[0]?.capabilityId).toBe('crm-seguimiento');
  });

  it('X counts only offered capabilities that are actually connected right now', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, { highlevel: true }, []);
    expect(summary.connectedTotal).toBe(1);
    expect(summary.connectedCount).toBe(1);
  });

  it('a specialist with zero offered execution capabilities still counts correctly (0 of 0), never inflated by unsupported ones', async () => {
    const { findSpecialistTemplate } = await import('./specialist-templates');
    // ciberseguridad-cumplimiento's capabilities are backed by siem/gestion-endpoints/etc — none map to a real integration.
    const cyberTemplate = findSpecialistTemplate('ciberseguridad-cumplimiento')!;
    const summary = resolveSpecialistWorkSummary(cyberTemplate, draft({ enabled: true }), true, {}, []);
    expect(summary.connectedTotal).toBe(0);
    expect(summary.connectedCount).toBe(0);
    expect(summary.offeredExecutionCapabilities).toEqual([]);
  });

  it('intellectualCapabilities and offeredExecutionCapabilities partition every offered capability, and never include a not_available one', () => {
    const summary = resolveSpecialistWorkSummary(TEMPLATE, draft({ enabled: true }), true, { highlevel: true }, []);
    for (const c of summary.intellectualCapabilities) expect(c.intellectualOnly).toBe(true);
    for (const c of summary.offeredExecutionCapabilities) {
      expect(c.intellectualOnly).toBe(false);
      expect(c.status).not.toBe('not_available');
    }
    // The 4 not_available capabilities are still present in the raw `capabilities`
    // list (internal metadata) but never in the two curated lists the UI renders.
    const notAvailable = summary.capabilities.filter((c) => c.status === 'not_available');
    expect(notAvailable.length).toBeGreaterThan(0);
    for (const c of notAvailable) {
      expect(summary.intellectualCapabilities).not.toContain(c);
      expect(summary.offeredExecutionCapabilities).not.toContain(c);
    }
  });
});

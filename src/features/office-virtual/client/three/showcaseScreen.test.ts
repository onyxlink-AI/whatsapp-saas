import { describe, expect, it } from 'vitest';
import { resolveShowcaseScreenKind } from './showcaseScreen';

describe('resolveShowcaseScreenKind', () => {
  it('never reveals the function of an inactive seat', () => {
    expect(resolveShowcaseScreenKind({ id: 'lead-intake', name: 'WhatsApp', department: 'WhatsApp' }, false)).toBe('generic');
    expect(resolveShowcaseScreenKind({ id: 'specialist-1', name: 'Community Manager', department: 'Redes sociales' }, false)).toBe('generic');
  });

  it('maps the four active fixed seats to their presentation visual', () => {
    expect(resolveShowcaseScreenKind({ id: 'coordinator', name: 'Orquestador', department: 'Coordinación' }, true)).toBe('brand');
    expect(resolveShowcaseScreenKind({ id: 'lead-intake', name: 'Agente', department: 'WhatsApp' }, true)).toBe('whatsapp');
    expect(resolveShowcaseScreenKind({ id: 'strategy', name: 'Agente', department: 'Voz' }, true)).toBe('voice');
    expect(resolveShowcaseScreenKind({ id: 'chatbot', name: 'Chatbot', department: 'Chatbot' }, true)).toBe('chatbot');
  });

  it.each([
    ['Analista de datos', 'analytics'],
    ['Community manager y redes sociales', 'social'],
    ['Gestor comercial y presupuestos', 'proposals'],
    ['Contabilidad y finanzas', 'finance'],
    ['Especialista de ciberseguridad', 'security'],
    ['Gestión de agenda y citas', 'calendar'],
    ['Atención al cliente y calidad', 'quality'],
  ] as const)('maps an active specialist in %s to %s', (department, expected) => {
    expect(resolveShowcaseScreenKind({ id: 'specialist-1', name: 'Especialista', department }, true)).toBe(expected);
  });

  it('uses the neutral dashboard for an unknown active role', () => {
    expect(resolveShowcaseScreenKind({ id: 'specialist-8', name: 'Especialista', department: 'Función personalizada' }, true)).toBe('generic');
  });
});

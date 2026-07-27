import { describe, expect, it } from 'vitest';
import { SPECIALIST_EXTENSIONS } from './specialist-extensions';
import { SPECIALIST_SKILLS } from './specialist-skills';
import { STANDARD_OFFICE_PRESET } from './preset';

describe('the 8 ampliaciones (extensions)', () => {
  it('has exactly the 8 required extensions and none creates a new character', () => {
    const ids = SPECIALIST_EXTENSIONS.map((e) => e.id).sort();
    expect(ids).toEqual(
      [
        'agenda-reservas',
        'marketing-contenidos',
        'legal-documental',
        'compras-proveedores',
        'calidad-auditoria',
        'documentacion-conocimiento',
        'producto-servicios',
        'automatizacion-sistemas',
      ].sort(),
    );
    // Extensions attach to existing specialist templates — they are never office seats themselves.
    const seatIds = STANDARD_OFFICE_PRESET.seats.map((s) => s.agentId);
    for (const extension of SPECIALIST_EXTENSIONS) {
      expect(seatIds).not.toContain(extension.id);
    }
  });
});

describe('the 8 habilidades internas (skills)', () => {
  it('has exactly the 8 required skills and none creates a new character', () => {
    const ids = SPECIALIST_SKILLS.map((s) => s.id).sort();
    expect(ids).toEqual(
      ['investigacion', 'redaccion', 'traduccion', 'analisis-documental', 'extraccion-datos', 'programacion', 'diseno', 'revision-calidad'].sort(),
    );
    const seatIds = STANDARD_OFFICE_PRESET.seats.map((s) => s.agentId);
    for (const skill of SPECIALIST_SKILLS) {
      expect(seatIds).not.toContain(skill.id);
    }
  });
});

describe('the office preset has exactly 12 despachos', () => {
  it('has 4 fixed seats (orchestrator, whatsapp, voice, chatbot) and 8 configurable specialist seats', () => {
    expect(STANDARD_OFFICE_PRESET.seats).toHaveLength(12);
    const fixed = STANDARD_OFFICE_PRESET.seats.filter((s) => !s.configurable);
    const configurable = STANDARD_OFFICE_PRESET.seats.filter((s) => s.configurable);
    expect(fixed).toHaveLength(4);
    expect(configurable).toHaveLength(8);
    expect(fixed.map((s) => s.agentId).sort()).toEqual(['chatbot', 'coordinator', 'lead-intake', 'strategy'].sort());
  });
});

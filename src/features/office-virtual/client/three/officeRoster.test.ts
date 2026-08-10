import { describe, expect, it } from 'vitest';
import { buildOfficeRoomSlots } from './officeRoster';
import type { OfficeAgentSeatProjection } from '../central-integrations/office-agent-projection';

const NO_READINESS = { whatsappReady: false, voiceReady: false, chatbotReady: false };
const EMPTY_SEAT_LABEL = 'Puesto vacío';

describe('office room slots — 12 rooms always visible', () => {
  it('always returns 12 room slots regardless of configuration state', () => {
    const slots = buildOfficeRoomSlots([], NO_READINESS);
    expect(slots).toHaveLength(12);
    // Every slot has a room shell even when nothing is configured.
    for (const slot of slots) {
      expect(slot.room).toBeTruthy();
    }
  });
});

describe('office room slots — characters only appear with real configuration', () => {
  it('shows no occupant for any seat when nothing is configured or ready', () => {
    const slots = buildOfficeRoomSlots([], NO_READINESS);
    for (const slot of slots) {
      expect(slot.occupant).toBeNull();
    }
  });

  it('shows the WhatsApp character only when the real channel is ready', () => {
    const notReady = buildOfficeRoomSlots([], { ...NO_READINESS, whatsappReady: false });
    const ready = buildOfficeRoomSlots([], { ...NO_READINESS, whatsappReady: true });
    expect(notReady.find((s) => s.seatId === 'lead-intake')?.occupant).toBeNull();
    expect(ready.find((s) => s.seatId === 'lead-intake')?.occupant).not.toBeNull();
  });

  it('shows the voice character only when the real channel is ready', () => {
    const notReady = buildOfficeRoomSlots([], { ...NO_READINESS, voiceReady: false });
    const ready = buildOfficeRoomSlots([], { ...NO_READINESS, voiceReady: true });
    expect(notReady.find((s) => s.seatId === 'strategy')?.occupant).toBeNull();
    expect(ready.find((s) => s.seatId === 'strategy')?.occupant).not.toBeNull();
  });

  it('shows the 💬 Chatbot character only when its own channel is ready', () => {
    const notReady = buildOfficeRoomSlots([], { ...NO_READINESS, chatbotReady: false });
    const ready = buildOfficeRoomSlots([], { ...NO_READINESS, chatbotReady: true });
    expect(notReady.find((s) => s.seatId === 'chatbot')?.occupant).toBeNull();
    expect(ready.find((s) => s.seatId === 'chatbot')?.occupant).not.toBeNull();
  });

  it('shows the coordinator only when at least one specialist is published and enabled', () => {
    const empty = buildOfficeRoomSlots([], NO_READINESS);
    expect(empty.find((s) => s.seatId === 'coordinator')?.occupant).toBeNull();

    const roster: OfficeAgentSeatProjection[] = [
      { agentId: 'specialist-1', name: 'Ana', function: 'Gestión', objective: 'Ayudar', color: '#2563eb' },
    ];
    const withSpecialist = buildOfficeRoomSlots(roster, NO_READINESS);
    expect(withSpecialist.find((s) => s.seatId === 'coordinator')?.occupant).not.toBeNull();
  });

  it('shows a specialist character only for seats present in the published roster, using their real name', () => {
    const roster: OfficeAgentSeatProjection[] = [
      { agentId: 'specialist-3', name: 'Gestor de Empresa', function: 'Gestión integral', objective: 'obj', color: '#059669' },
    ];
    const slots = buildOfficeRoomSlots(roster, NO_READINESS);
    const configured = slots.find((s) => s.seatId === 'specialist-3');
    const unconfigured = slots.find((s) => s.seatId === 'specialist-4');

    expect(configured?.occupant?.name).toBe('Gestor de Empresa');
    expect(unconfigured?.occupant).toBeNull();
    // The empty room still renders with a generic label, never hidden.
    expect(unconfigured?.room).toBeTruthy();
  });
});

describe('office room slots — an inactive/unavailable seat carries NO real data, not even in the room shell', () => {
  it('an unpublished/disabled specialist seat renders a generic "Puesto vacío" shell — no name, function, objective, template, color or id-revealing data ever configured for it', () => {
    // Simulates a seat that WAS configured and is now disabled/unpublished:
    // the roster simply omits it (exactly what the sanitized projection
    // does for a disabled seat — see office-agent-projection.ts).
    const slots = buildOfficeRoomSlots([], NO_READINESS);
    const empty = slots.find((s) => s.seatId === 'specialist-5')!;

    expect(empty.occupant).toBeNull();
    expect(empty.room.name).toBe(EMPTY_SEAT_LABEL);
    expect(empty.room.department).toBe(EMPTY_SEAT_LABEL);
    // Never a per-seat "Especialista N" label or a stale/previous identity —
    // fully generic and identical across every empty specialist seat.
    const serialized = JSON.stringify(empty.room);
    expect(serialized).not.toMatch(/especialista|sin configurar/i);
  });

  it('every empty specialist seat shares the exact same generic shell (no per-seat identity leaks through numbering, color, or appearance)', () => {
    const slots = buildOfficeRoomSlots([], NO_READINESS);
    const specialistSlots = slots.filter((s) => /^specialist-/.test(s.seatId));
    expect(specialistSlots).toHaveLength(8);
    const [first, ...rest] = specialistSlots;
    for (const slot of rest) {
      expect(slot.room.name).toBe(first.room.name);
      expect(slot.room.department).toBe(first.room.department);
      expect(slot.room.color).toBe(first.room.color);
    }
  });

  it('WhatsApp room shows no "WhatsApp" department/identity when the channel is not ready — a genuinely empty desk, not a hidden character', () => {
    const slots = buildOfficeRoomSlots([], { ...NO_READINESS, whatsappReady: false });
    const seat = slots.find((s) => s.seatId === 'lead-intake')!;
    expect(seat.occupant).toBeNull();
    expect(seat.room.department).toBe(EMPTY_SEAT_LABEL);
    expect(seat.room.name).toBe(EMPTY_SEAT_LABEL);
    expect(JSON.stringify(seat.room)).not.toMatch(/whatsapp|sofía|sof[íi]a/i);
  });

  it('WhatsApp room shows its real department once the channel is ready', () => {
    const slots = buildOfficeRoomSlots([], { ...NO_READINESS, whatsappReady: true });
    const seat = slots.find((s) => s.seatId === 'lead-intake')!;
    expect(seat.occupant).not.toBeNull();
    expect(seat.room.department).not.toBe(EMPTY_SEAT_LABEL);
  });

  it('voice room shows no department/identity when not ready, and its real one once ready', () => {
    const notReady = buildOfficeRoomSlots([], { ...NO_READINESS, voiceReady: false }).find((s) => s.seatId === 'strategy')!;
    expect(notReady.room.department).toBe(EMPTY_SEAT_LABEL);
    expect(JSON.stringify(notReady.room)).not.toMatch(/voz|elena/i);

    const ready = buildOfficeRoomSlots([], { ...NO_READINESS, voiceReady: true }).find((s) => s.seatId === 'strategy')!;
    expect(ready.room.department).not.toBe(EMPTY_SEAT_LABEL);
  });

  it('coordinator room shows no department/identity when no specialist is published, and its real one once occupied', () => {
    const notReady = buildOfficeRoomSlots([], NO_READINESS).find((s) => s.seatId === 'coordinator')!;
    expect(notReady.room.department).toBe(EMPTY_SEAT_LABEL);
    expect(JSON.stringify(notReady.room)).not.toMatch(/coordinaci[oó]n|orquestador/i);

    const roster: OfficeAgentSeatProjection[] = [
      { agentId: 'specialist-1', name: 'Ana', function: 'Gestión', objective: 'Ayudar', color: '#2563eb' },
    ];
    const ready = buildOfficeRoomSlots(roster, NO_READINESS).find((s) => s.seatId === 'coordinator')!;
    expect(ready.room.department).not.toBe(EMPTY_SEAT_LABEL);
  });

  it('the Chatbot room shows no "Chatbot" label at all when disabled/disconnected — a plain empty desk', () => {
    const notReady = buildOfficeRoomSlots([], { ...NO_READINESS, chatbotReady: false }).find((s) => s.seatId === 'chatbot')!;
    expect(notReady.room.department).toBe(EMPTY_SEAT_LABEL);
    expect(notReady.room.name).toBe(EMPTY_SEAT_LABEL);
    // `seatId`/`room.id` stay the structural "chatbot" key (never shown to
    // the user); only the user-visible name/department fields are asserted
    // here, since those are what the floating room sign actually renders.
    expect(notReady.room.name).not.toMatch(/chatbot/i);
    expect(notReady.room.department).not.toMatch(/chatbot/i);

    const ready = buildOfficeRoomSlots([], { ...NO_READINESS, chatbotReady: true }).find((s) => s.seatId === 'chatbot')!;
    expect(ready.room.department).toBe('Chatbot');
  });
});

// Fase 3 — nombre visible configurable en los 4 puestos fijos, con
// fallback al nombre por defecto cuando no hay override (compatibilidad
// con configuraciones existentes).
describe('office room slots — nombre visible configurable de los puestos fijos, con fallback', () => {
  it('sin ningún override, cada puesto fijo ocupado usa su nombre por defecto de siempre', () => {
    const roster: OfficeAgentSeatProjection[] = [{ agentId: 'specialist-1', name: 'Ana', function: 'Gestión', objective: 'x', color: '#2563eb' }];
    const readiness = { whatsappReady: true, voiceReady: true, chatbotReady: true };
    const slots = buildOfficeRoomSlots(roster, readiness, {});

    expect(slots.find((s) => s.seatId === 'coordinator')?.occupant?.name).toBe('Orquestador');
    expect(slots.find((s) => s.seatId === 'lead-intake')?.occupant?.name).toBe('Sofía');
    expect(slots.find((s) => s.seatId === 'strategy')?.occupant?.name).toBe('Elena');
    expect(slots.find((s) => s.seatId === 'chatbot')?.occupant?.name).toBe('Chatbot');
  });

  it('un override configurado sustituye el nombre visible del puesto ocupado, sin tocar su función/color/estado', () => {
    const roster: OfficeAgentSeatProjection[] = [{ agentId: 'specialist-1', name: 'Ana', function: 'Gestión', objective: 'x', color: '#2563eb' }];
    const readiness = { whatsappReady: true, voiceReady: true, chatbotReady: true };
    const withDefault = buildOfficeRoomSlots(roster, readiness, {}).find((s) => s.seatId === 'lead-intake')!.occupant!;
    const withOverride = buildOfficeRoomSlots(roster, readiness, { 'lead-intake': 'Pepe' }).find((s) => s.seatId === 'lead-intake')!.occupant!;

    expect(withOverride.name).toBe('Pepe');
    expect(withOverride.department).toBe(withDefault.department);
    expect(withOverride.color).toBe(withDefault.color);
    expect(withOverride.status).toBe(withDefault.status);
  });

  it('un puesto fijo VACÍO nunca revela el nombre configurado — la privacidad de "puesto vacío" sigue aplicando aunque haya un override guardado', () => {
    // El puesto WhatsApp tiene un nombre configurado, pero el canal no está listo.
    const slots = buildOfficeRoomSlots([], { ...NO_READINESS, whatsappReady: false }, { 'lead-intake': 'Pepe' });
    const seat = slots.find((s) => s.seatId === 'lead-intake')!;
    expect(seat.occupant).toBeNull();
    expect(seat.room.name).toBe(EMPTY_SEAT_LABEL);
    expect(JSON.stringify(seat.room)).not.toMatch(/pepe/i);
  });

  it('permite configurar los 4 puestos fijos de forma independiente entre sí', () => {
    const readiness = { whatsappReady: true, voiceReady: true, chatbotReady: true };
    const roster: OfficeAgentSeatProjection[] = [{ agentId: 'specialist-1', name: 'Ana', function: 'Gestión', objective: 'x', color: '#2563eb' }];
    const slots = buildOfficeRoomSlots(roster, readiness, { coordinator: 'Uno', 'lead-intake': 'Dos', strategy: 'Tres', chatbot: 'Cuatro' });

    expect(slots.find((s) => s.seatId === 'coordinator')?.occupant?.name).toBe('Uno');
    expect(slots.find((s) => s.seatId === 'lead-intake')?.occupant?.name).toBe('Dos');
    expect(slots.find((s) => s.seatId === 'strategy')?.occupant?.name).toBe('Tres');
    expect(slots.find((s) => s.seatId === 'chatbot')?.occupant?.name).toBe('Cuatro');
  });

  it('sin argumento coreSeatDisplayNames (llamada existente sin actualizar), sigue funcionando igual que antes — compatibilidad', () => {
    const roster: OfficeAgentSeatProjection[] = [{ agentId: 'specialist-1', name: 'Ana', function: 'Gestión', objective: 'x', color: '#2563eb' }];
    const slots = buildOfficeRoomSlots(roster, { whatsappReady: true, voiceReady: true, chatbotReady: true });
    expect(slots.find((s) => s.seatId === 'coordinator')?.occupant?.name).toBe('Orquestador');
  });
});

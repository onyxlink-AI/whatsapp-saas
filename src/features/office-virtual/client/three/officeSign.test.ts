import { describe, expect, it } from 'vitest';
import { officeSignContent } from './officeSign';
import { buildOfficeRoomSlots } from './officeRoster';
import type { OfficeAgentSeatProjection } from '../central-integrations/office-agent-projection';

const ALL_READY = { whatsappReady: true, voiceReady: true, chatbotReady: true };
const NONE_READY = { whatsappReady: false, voiceReady: false, chatbotReady: false };

const ROSTER_ALL_SPECIALISTS: OfficeAgentSeatProjection[] = Array.from({ length: 8 }, (_, i) => ({
  agentId: `specialist-${i + 1}` as OfficeAgentSeatProjection['agentId'],
  name: `Especialista Real ${i + 1}`,
  function: `Función ${i + 1}`,
  objective: `Objetivo ${i + 1}`,
  color: '#2563eb',
}));

describe('officeSignContent — the exact on-screen text decision OfficeRoom.tsx renders', () => {
  it('an occupied seat shows its real department as visible text, and the same text is available to assistive tech', () => {
    const slots = buildOfficeRoomSlots(ROSTER_ALL_SPECIALISTS, ALL_READY);
    for (const slot of slots) {
      expect(slot.occupant).not.toBeNull();
      const sign = officeSignContent(slot.room, true);
      expect(sign.visible).toBe(true);
      expect(sign.visibleText).toBe(slot.room.department);
      expect(sign.accessibleText).toBe(slot.room.department);
    }
  });

  it('an inactive/unavailable seat shows NO visible text at all — not even "Puesto vacío" — for every specialist and every fixed seat', () => {
    const slots = buildOfficeRoomSlots([], NONE_READY);
    expect(slots).toHaveLength(12);
    for (const slot of slots) {
      expect(slot.occupant).toBeNull();
      const sign = officeSignContent(slot.room, false);
      expect(sign.visible).toBe(false);
      expect(sign.visibleText).toBeNull();
    }
  });

  it('the sr-only accessible description exists but is never a visible string — "Puesto vacío" only ever reaches accessibleText, never visibleText', () => {
    const slots = buildOfficeRoomSlots([], NONE_READY);
    for (const slot of slots) {
      const sign = officeSignContent(slot.room, false);
      expect(sign.accessibleText).toBe('Puesto vacío');
      expect(sign.visibleText).not.toBe('Puesto vacío');
      expect(sign.visibleText).toBeNull();
    }
  });

  it('works independently across all 4 fixed seats — each hides its own text when not ready, regardless of the others', () => {
    const seatIds = ['coordinator', 'lead-intake', 'strategy', 'chatbot'];
    for (const seatId of seatIds) {
      const readiness = { ...NONE_READY };
      if (seatId === 'lead-intake') readiness.whatsappReady = true;
      if (seatId === 'strategy') readiness.voiceReady = true;
      if (seatId === 'chatbot') readiness.chatbotReady = true;
      const roster = seatId === 'coordinator' ? ROSTER_ALL_SPECIALISTS : [];

      const slots = buildOfficeRoomSlots(roster, readiness);
      for (const slot of slots) {
        const isThisSeat = slot.seatId === seatId;
        const sign = officeSignContent(slot.room, slot.occupant !== null);
        if (isThisSeat) {
          expect(sign.visible).toBe(true);
        }
        // Every OTHER fixed seat with no readiness and no specialists stays silent.
        if (!isThisSeat && ['coordinator', 'lead-intake', 'strategy', 'chatbot'].includes(slot.seatId) && slot.seatId !== seatId) {
          if (slot.seatId === 'coordinator' && seatId !== 'coordinator') continue; // coordinator depends on roster, checked separately
          expect(sign.visible).toBe(false);
        }
      }
    }
  });
});

describe('office layout — the 12-room distribution never changes shape based on activity', () => {
  it('the set and order of seatIds stays identical whether everything is active or nothing is', () => {
    const busy = buildOfficeRoomSlots(ROSTER_ALL_SPECIALISTS, ALL_READY).map((s) => s.seatId);
    const empty = buildOfficeRoomSlots([], NONE_READY).map((s) => s.seatId);
    expect(busy).toEqual(empty);
    expect(busy).toHaveLength(12);
  });
});

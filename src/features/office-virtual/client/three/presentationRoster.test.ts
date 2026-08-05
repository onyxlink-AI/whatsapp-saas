import { describe, expect, it } from 'vitest';
import { buildOfficeRoomSlots } from './officeRoster';
import { buildPresentationRoomSlots } from './presentationRoster';

const NONE_READY = { whatsappReady: false, voiceReady: false, chatbotReady: false };

describe('buildPresentationRoomSlots', () => {
  it('fills all 12 fictional presentation seats without changing room order', () => {
    const operative = buildOfficeRoomSlots([], NONE_READY);
    const presentation = buildPresentationRoomSlots(operative);

    expect(presentation).toHaveLength(12);
    expect(presentation.map((slot) => slot.seatId)).toEqual(operative.map((slot) => slot.seatId));
    expect(presentation.filter((slot) => slot.occupant !== null)).toHaveLength(12);
    expect(presentation.find((slot) => slot.seatId === 'lead-intake')?.occupant?.department).toBe('WhatsApp');
  });

  it('uses curated product roles instead of leaking real or inactive client data', () => {
    const operative = buildOfficeRoomSlots([], NONE_READY);
    const presentation = buildPresentationRoomSlots(operative);

    expect(presentation.find((slot) => slot.seatId === 'lead-intake')?.room.department).toBe('WhatsApp');
    expect(presentation.find((slot) => slot.seatId === 'strategy')?.room.department).toBe('Línea telefónica');
    expect(presentation.find((slot) => slot.seatId === 'specialist-1')?.room.department).toBe('Datos e informes');
    expect(presentation.find((slot) => slot.seatId === 'specialist-2')?.room.department).toBe('Redes sociales');
    expect(presentation.some((slot) => slot.room.name === 'Puesto vacío')).toBe(false);
  });

  it('keeps presentation fictional even when a real channel is ready', () => {
    const operative = buildOfficeRoomSlots([], { ...NONE_READY, whatsappReady: true });
    const presentation = buildPresentationRoomSlots(operative);

    expect(presentation.find((slot) => slot.seatId === 'lead-intake')?.occupant?.department).toBe('WhatsApp');
  });
});

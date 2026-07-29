import { describe, expect, it } from 'vitest';
import { buildOfficeRoomSlots } from './officeRoster';
import { buildPresentationRoomSlots } from './presentationRoster';

const NONE_READY = { whatsappReady: false, voiceReady: false, chatbotReady: false };

describe('buildPresentationRoomSlots', () => {
  it('keeps unconfigured WhatsApp empty without changing the 12-room order', () => {
    const operative = buildOfficeRoomSlots([], NONE_READY);
    const presentation = buildPresentationRoomSlots(operative);

    expect(presentation).toHaveLength(12);
    expect(presentation.map((slot) => slot.seatId)).toEqual(operative.map((slot) => slot.seatId));
    expect(presentation.filter((slot) => slot.occupant !== null)).toHaveLength(11);
    expect(presentation.find((slot) => slot.seatId === 'lead-intake')?.occupant).toBeNull();
  });

  it('uses curated product roles instead of leaking real or inactive client data', () => {
    const operative = buildOfficeRoomSlots([], NONE_READY);
    const presentation = buildPresentationRoomSlots(operative);

    expect(presentation.find((slot) => slot.seatId === 'lead-intake')?.room.department).not.toBe('WhatsApp');
    expect(presentation.find((slot) => slot.seatId === 'strategy')?.room.department).toBe('Línea telefónica');
    expect(presentation.find((slot) => slot.seatId === 'specialist-1')?.room.department).toBe('Datos e informes');
    expect(presentation.find((slot) => slot.seatId === 'specialist-2')?.room.department).toBe('Redes sociales');
    expect(presentation.filter((slot) => slot.seatId !== 'lead-intake').some((slot) => slot.room.name === 'Puesto vacío')).toBe(false);
  });

  it('shows the curated WhatsApp worker only after the real slot is ready', () => {
    const operative = buildOfficeRoomSlots([], { ...NONE_READY, whatsappReady: true });
    const presentation = buildPresentationRoomSlots(operative);

    expect(presentation.find((slot) => slot.seatId === 'lead-intake')?.occupant?.department).toBe('WhatsApp');
  });
});

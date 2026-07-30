import { agents as staticAgents } from '../agents';
import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId } from '../central-integrations/specialist-seats';
import type { OfficeAgentSeatProjection } from '../central-integrations/office-agent-projection';
import type { CharacterAppearance, OfficeSceneAgent } from '../types';

// Builds the 12 room slots the 3D scene renders: room geometry always shows
// (see Building.tsx), the character (`occupant`) only when there's real,
// current configuration/activation behind that seat — never a timer, never
// a fixture. WhatsApp/voice readiness comes from the real capability
// snapshot (useOfficeActivation); the specialist roster comes from the
// published, sanitized projection (useOfficeAgentsRoster) — this module
// never reads draft content.
//
// An inactive/unavailable seat (specialist OR any of the 4 fixed seats —
// coordinator/WhatsApp/voice/chatbot) must show a genuinely empty desk: the
// `room` shell itself carries no real name/department/color for that seat,
// only the neutral EMPTY_SEAT shape — never the real agent object with just
// the character suppressed. That's what makes this a structural absence of
// data instead of a CSS/JSX hide of data that is still present.

export type OfficeRoomSlot = {
  seatId: string;
  /** Shell used for the room's geometry/sign/color — always present, even for an empty seat. */
  room: OfficeSceneAgent;
  /** The character to render — null means the room is empty. */
  occupant: OfficeSceneAgent | null;
};

export type OfficeSeatReadiness = {
  whatsappReady: boolean;
  voiceReady: boolean;
  chatbotReady: boolean;
};

/** Accessible label for any empty desk — never the seat's former/real identity. */
const EMPTY_SEAT_LABEL = 'Puesto vacío';
const EMPTY_SEAT_COLOR = '#94a3b8';
const EMPTY_SEAT_APPEARANCE: CharacterAppearance = {
  shirtColor: '#94a3b8',
  pantsColor: '#334155',
  skinColor: '#cbd5e1',
  hairColor: '#475569',
};

function emptySeatShell(seatId: string): OfficeSceneAgent {
  return {
    id: seatId,
    name: EMPTY_SEAT_LABEL,
    department: EMPTY_SEAT_LABEL,
    color: EMPTY_SEAT_COLOR,
    status: 'available',
    appearance: EMPTY_SEAT_APPEARANCE,
  };
}

const CHATBOT_SHELL: OfficeSceneAgent = {
  id: 'chatbot',
  name: 'Chatbot',
  department: 'Chatbot',
  color: '#8AD3D2',
  status: 'available',
  appearance: { shirtColor: '#5AA9A8', pantsColor: '#172033', skinColor: '#cbd5e1', hairColor: '#334155' },
};

const SPECIALIST_APPEARANCES: Record<ConfigurableOfficeAgentId, CharacterAppearance> = {
  'specialist-1': { shirtColor: '#2563eb', pantsColor: '#172033', skinColor: '#d89b6a', hairColor: '#281a13' },
  'specialist-2': { shirtColor: '#e11d48', pantsColor: '#202536', skinColor: '#f1c19b', hairColor: '#151515' },
  'specialist-3': { shirtColor: '#d97706', pantsColor: '#1f2937', skinColor: '#8d5524', hairColor: '#19110b' },
  'specialist-4': { shirtColor: '#0891b2', pantsColor: '#152235', skinColor: '#f2c6a0', hairColor: '#6b3f25' },
  'specialist-5': { shirtColor: '#79CBCA', pantsColor: '#1e293b', skinColor: '#e3ab7a', hairColor: '#171310' },
  'specialist-6': { shirtColor: '#059669', pantsColor: '#111827', skinColor: '#f4c99b', hairColor: '#222222' },
  'specialist-7': { shirtColor: '#db2777', pantsColor: '#1e293b', skinColor: '#e3ab7a', hairColor: '#1a1a1a' },
  'specialist-8': { shirtColor: '#397C7B', pantsColor: '#1e293b', skinColor: '#f4c99b', hairColor: '#5c3a21' },
};

export function buildOfficeRoomSlots(roster: OfficeAgentSeatProjection[], readiness: OfficeSeatReadiness): OfficeRoomSlot[] {
  const coordinator = staticAgents.find((a) => a.id === 'coordinator');
  const whatsapp = staticAgents.find((a) => a.id === 'lead-intake');
  const voice = staticAgents.find((a) => a.id === 'strategy');
  const rosterById = new Map(roster.map((seat) => [seat.agentId, seat]));
  const hasAnyPublishedSpecialist = roster.length > 0;

  const slots: OfficeRoomSlot[] = [];

  if (coordinator) {
    const occupied = hasAnyPublishedSpecialist;
    slots.push({ seatId: 'coordinator', room: occupied ? coordinator : emptySeatShell('coordinator'), occupant: occupied ? coordinator : null });
  }
  if (whatsapp) {
    const occupied = readiness.whatsappReady;
    slots.push({ seatId: 'lead-intake', room: occupied ? whatsapp : emptySeatShell('lead-intake'), occupant: occupied ? whatsapp : null });
  }
  if (voice) {
    const occupied = readiness.voiceReady;
    slots.push({ seatId: 'strategy', room: occupied ? voice : emptySeatShell('strategy'), occupant: occupied ? voice : null });
  }
  {
    const occupied = readiness.chatbotReady;
    slots.push({ seatId: 'chatbot', room: occupied ? CHATBOT_SHELL : emptySeatShell('chatbot'), occupant: occupied ? CHATBOT_SHELL : null });
  }

  CONFIGURABLE_AGENT_IDS.forEach((agentId) => {
    const published = rosterById.get(agentId);
    if (published) {
      const occupant: OfficeSceneAgent = {
        id: agentId,
        name: published.name,
        department: published.function,
        color: published.color,
        status: 'available',
        appearance: SPECIALIST_APPEARANCES[agentId],
      };
      slots.push({ seatId: agentId, room: occupant, occupant });
    } else {
      slots.push({ seatId: agentId, room: emptySeatShell(agentId), occupant: null });
    }
  });

  return slots;
}

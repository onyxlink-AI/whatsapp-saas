import type { AgentId } from '../schemas';
import type { OfficeSeatBinding } from './central-events/agent-bindings';
import type { AgentRuntimeStatus } from './central-events/types';

// Reuses the coordinator/Codex activity contract (src/central-events/types.ts)
// so the office's visual status is always one of the real operational states
// — never a value the UI invented on its own. See COORDINACION_CLAUDE_CODEX.md.
export type AgentStatus = AgentRuntimeStatus;

export type CharacterAppearance = {
  /** Shirt / torso & arms color */
  shirtColor: string;
  /** Pants / legs color */
  pantsColor: string;
  /** Skin tone for head & hands */
  skinColor: string;
  /** Hair color (a thin cap on top of the head) */
  hairColor: string;
};

export type Department = {
  id: AgentId;
  /** The agent's own name, shown as their floating name tag, e.g. "Sofía" */
  name: string;
  /** Short department label shown on the office sign, e.g. "Ventas" */
  department: string;
  /** Job title of the agent staffing it, e.g. "Agente de Ventas" */
  role: string;
  description: string;
  /** Primary accent color for the room (floor trim, sign, glow) */
  color: string;
  status: AgentStatus;
  appearance: CharacterAppearance;
  /** Which real SaaS seat this office role stands in for — see OFFICE_SEAT_BINDINGS. */
  seat: OfficeSeatBinding;
};

// Kept as an alias so chat/hook code reads naturally ("the agent replied").
export type Agent = Department;

/**
 * The subset of Agent/Department the 3D scene (Building/OfficeRoom/
 * OfficeCharacter) actually renders. A real Agent always satisfies this
 * structurally, so the 3 SaaS-reused seats (coordinator/lead-intake/
 * strategy) pass through unchanged; the chatbot seat and the 8 configurable
 * specialist seats build one of these directly instead, since they don't
 * have (and don't need) a full OfficeSeatBinding.
 */
export type OfficeSceneAgent = {
  id: string;
  name: string;
  department: string;
  color: string;
  status: AgentStatus;
  appearance: CharacterAppearance;
};

/**
 * Real two-step confirmation for a content substitution proposed by the
 * "Creador de Contenido" specialist — backed by the SAME `assistant_pending_actions`
 * infra and `/api/workspace/[id]/help-assistant/confirm` endpoint the
 * Asistente de Ayuda already uses (see use-help-assistant-chat.ts). Kept as
 * optional fields on the flat ChatMessage shape, matching this file's
 * existing `approvalStatus` convention rather than introducing a separate
 * discriminated message union.
 */
export type ContentConfirmation = {
  token: string;
  summary: string;
  expiresAt: number;
  status: 'pending' | 'resolving' | 'resolved' | 'error' | 'retryable';
  lastDecision?: 'confirm' | 'cancel';
  resultText?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
  /** Set when this reply represents a gated action awaiting a human decision. */
  approvalRequestId?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  contentConfirmation?: ContentConfirmation;
};

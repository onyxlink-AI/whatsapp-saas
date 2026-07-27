import type { OfficeSceneAgent } from '../types';

// The single decision OfficeRoom.tsx defers to for its floating sign: an
// inactive/unavailable seat must show NO visible text at all — not even a
// generic "Puesto vacío" placeholder — only a non-visual (sr-only)
// description for assistive tech. Extracted as a pure function so this
// exact decision is unit-testable without needing a WebGL/Canvas renderer
// (this codebase has none, by design — see officeRoster.test.ts).

export type OfficeSignContent = {
  /** Whether the visible, on-screen sign should render at all. */
  visible: boolean;
  /** The on-screen text — always null when the seat isn't occupied. */
  visibleText: string | null;
  /** Screen-reader-only description, present either way, never revealing more than `visibleText` would for an occupied seat. */
  accessibleText: string;
};

export function officeSignContent(agent: OfficeSceneAgent, occupied: boolean): OfficeSignContent {
  return {
    visible: occupied,
    visibleText: occupied ? agent.department : null,
    accessibleText: agent.department,
  };
}

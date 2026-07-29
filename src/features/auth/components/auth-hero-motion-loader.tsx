"use client";

import dynamic from "next/dynamic";

// AuthHeroMotion reads `prefers-reduced-motion` via framer-motion's
// useReducedMotion(), which is unknown during SSR (no `window`) and read
// synchronously on the client's first render — so server and client
// disagreed on the entrance animation's `initial` style whenever a real
// visitor had reduced motion enabled, producing a reproducible hydration
// mismatch (confirmed via a real browser with reducedMotion emulation).
// The component is purely decorative (`aria-hidden="true"`, zero content),
// so the correct fix is to skip SSR for it entirely — same pattern already
// used for the Oficina Virtual 3D canvas — rather than patch around a
// value that's structurally unknowable until the client mounts.
const AuthHeroMotionClientOnly = dynamic(
  () => import("./auth-hero-motion").then((mod) => mod.AuthHeroMotion),
  { ssr: false },
);

export { AuthHeroMotionClientOnly as AuthHeroMotion };

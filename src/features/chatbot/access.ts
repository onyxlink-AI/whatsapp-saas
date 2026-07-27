// Single source of truth for the chatbot_enabled gate, shared by the nav
// link in (main)/layout.tsx and the route guard in (main)/chatbot/page.tsx
// so the two checks can never drift apart — mirrors
// src/features/office-virtual/access.ts exactly.
export function isChatbotEnabled(workspace: { chatbot_enabled: boolean | null } | null | undefined): boolean {
  return workspace?.chatbot_enabled === true;
}

// The Chatbot is NOT client self-service (unlike Oficina Virtual): only the
// platform superadmin may ever see the nav link or reach /chatbot, even when
// the plan flag is on for that workspace. Single source of truth shared by
// the nav link in (main)/layout.tsx and the route guard in
// (main)/chatbot/page.tsx.
export function canSeeChatbotNav(
  isSuperAdmin: boolean,
  workspace: { chatbot_enabled: boolean | null } | null | undefined,
): boolean {
  return isSuperAdmin && isChatbotEnabled(workspace);
}

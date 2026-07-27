import type { ZodSchema } from "zod";

export type ToolSensitivity = "read" | "write" | "sensitive";

export interface ToolContext {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  // SEC-01: identity anchored server-side — LLM cannot override these
}

export interface ToolResult {
  ok: boolean;
  output: unknown;
  error?: string;
  requiresConfirmation?: boolean; // SEC-01: true for sensitive tools pending human approval
}

export interface ToolRunOptions {
  timeoutMs?: number; // default 10_000
  retries?: number; // default 1
  // When true, the registry never calls Tool.run() — it returns a canned
  // ToolResult built from `simulationMessage` instead. Used by the agent
  // test playground so a test conversation can never book a real
  // appointment, hit a real webhook, or call a real external calendar API.
  simulate?: boolean;
}

export interface Tool<TArgs = unknown> {
  name: string;
  description: string;
  sensitivity: ToolSensitivity;
  schema: ZodSchema<TArgs>;
  // Shown to the user instead of a real result when the tool runs under
  // ToolRunOptions.simulate — describes what the tool would have done
  // without actually doing it.
  simulationMessage: string;
  enabledFor(workspaceId: string): boolean | Promise<boolean>;
  run(
    args: TArgs,
    ctx: ToolContext,
    opts?: ToolRunOptions,
  ): Promise<ToolResult>;
}

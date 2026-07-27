import { z } from "zod";
import type { Tool } from "../core/tool";

export const echoTool: Tool<{ msg: string }> = {
  name: "echo",
  description:
    "Echo back a message — used to validate the Tool contract end-to-end",
  sensitivity: "read",
  simulationMessage: "Ejecutaría esta herramienta de prueba con estos datos.",
  schema: z.object({ msg: z.string() }),
  enabledFor: () => true,
  run: async ({ msg }) => ({ ok: true, output: msg }),
};

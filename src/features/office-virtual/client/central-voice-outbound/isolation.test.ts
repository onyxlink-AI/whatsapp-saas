// Regression test proving Vapi outbound calling stays fully disconnected:
// no public route, no cron trigger, no import from any executable code
// path, and the one function this module exports cannot place a call by
// itself (no fetch/network call inside it). If any of this ever changes —
// someone wires a route, a cron job, or an import to this module — this
// test must fail and force a deliberate decision, never an accidental one.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(process.cwd());
const MODULE_DIR = resolve(REPO_ROOT, "src/features/office-virtual/client/central-voice-outbound");
const MODULE_FILES = ["index.ts", "state.ts", "types.ts", "validation.ts", "vapi.ts"];

function walk(dir: string, exclude: string[], onFile: (path: string) => void) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (exclude.some((ex) => full === ex || full.startsWith(ex + "\\") || full.startsWith(ex + "/"))) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      walk(full, exclude, onFile);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      onFile(full);
    }
  }
}

describe("central-voice-outbound — aislamiento de llamadas salientes", () => {
  it("ningún archivo ejecutable fuera del propio módulo lo importa", () => {
    const offendingImports: string[] = [];
    walk(resolve(REPO_ROOT, "src"), [MODULE_DIR], (file) => {
      const content = readFileSync(file, "utf8");
      if (content.includes("central-voice-outbound")) offendingImports.push(file);
    });
    expect(offendingImports).toEqual([]);
  });

  it("ninguna ruta pública (src/app/api) lo referencia", () => {
    const offendingRoutes: string[] = [];
    walk(resolve(REPO_ROOT, "src/app/api"), [], (file) => {
      const content = readFileSync(file, "utf8");
      if (content.includes("central-voice-outbound") || content.includes("buildVapiAppointmentReminderRequest")) {
        offendingRoutes.push(file);
      }
    });
    expect(offendingRoutes).toEqual([]);
  });

  it("ningún cron de Supabase lo dispara", () => {
    const cronDir = resolve(REPO_ROOT, "supabase/cron");
    const offendingCrons: string[] = [];
    for (const entry of readdirSync(cronDir)) {
      const content = readFileSync(join(cronDir, entry), "utf8");
      if (/vapi|voice.?outbound|voice_call/i.test(content)) offendingCrons.push(entry);
    }
    expect(offendingCrons).toEqual([]);
  });

  it("el único constructor de request (buildVapiAppointmentReminderRequest) nunca hace red por sí mismo", () => {
    const source = readFileSync(join(MODULE_DIR, "vapi.ts"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/axios/i);
  });

  it("el módulo completo no contiene ninguna llamada de red real en ninguno de sus 5 archivos", () => {
    for (const file of MODULE_FILES) {
      const source = readFileSync(join(MODULE_DIR, file), "utf8");
      expect(source, `${file} no debería contener fetch()`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("no existe ninguna ruta API bajo /vapi-outbound o similar", () => {
    const apiDir = resolve(REPO_ROOT, "src/app/api");
    const suspiciousDirs: string[] = [];
    walk(apiDir, [], (file) => {
      if (/voice-outbound|vapi-outbound|outbound-call/i.test(file)) suspiciousDirs.push(file);
    });
    expect(suspiciousDirs).toEqual([]);
  });
});

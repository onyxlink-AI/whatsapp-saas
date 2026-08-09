// Fase 4C — ejecutar ANTES de habilitar las tools de Board del Asistente
// de Ayuda en producción (help_assistant_actions_enabled / plan). Nunca
// modifica ninguna escena. Sale con código distinto de 0 si algún tablero
// supera los límites nuevos o tiene elementos estructuralmente inválidos
// — en ese caso, la migración operativa debe detenerse hasta revisar el
// inventario impreso a mano.
//
// Uso: npx tsx scripts/whiteboard-scene-preflight.ts [workspaceId]
import { runWhiteboardScenePreflight, formatPreflightReport } from "../src/features/whiteboard/services/scene-preflight";

async function main() {
  const workspaceId = process.argv[2];
  const report = await runWhiteboardScenePreflight(workspaceId);
  console.log(formatPreflightReport(report));

  if (report.boardsOverLimits > 0 || report.boardsWithInvalidElements > 0) {
    console.error("\n⚠️  Preflight detectó tableros que requieren revisión manual antes de continuar.");
    process.exit(1);
  }
  console.log("\n✅ Todos los tableros están dentro de límites y son estructuralmente válidos.");
}

main().catch((err) => {
  console.error("[whiteboard-scene-preflight] error:", err);
  process.exit(1);
});

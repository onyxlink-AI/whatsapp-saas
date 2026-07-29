import type { VerticalPromptOverlay } from './specialist-verticals';

// Ported from the Agencia IA prototype (src/lib/specialistPromptLayers.ts).
// BASE < SECTOR < CLIENTE, compiled for display/use without ever mutating
// any of the three source layers. Only the client layer is ever
// user-editable; base and sector are always read-only inputs here.
export type SpecialistPromptLayersInput = {
  /** e.g. "${template.name} — ${template.function}" */
  identity: string;
  /** The template's own base instructions — read-only in this layer. */
  baseInstructions: string;
  verticalOverlay: VerticalPromptOverlay | null;
  /** Free text the user writes for this client — the only editable layer. */
  clientLayer: string;
  /** The template's own safetyNotes — combined with the overlay's, if any. */
  safetyNotes: string[];
};

export type CompiledSpecialistPrompt = {
  identitySection: string;
  sectorInstructionsSection: string;
  clientPoliciesSection: string;
  safetyLimitsSection: string;
  outputFormatSection: string;
  compiledText: string;
};

const OUTPUT_FORMAT_SECTION =
  'Responde con una explicación clara para el usuario. Nunca muestres notas internas. Indica siempre qué se ha hecho, qué falta y qué debe hacer el usuario si algo queda pendiente.';

export function compileEffectiveSpecialistPrompt(input: SpecialistPromptLayersInput): CompiledSpecialistPrompt {
  const identitySection = input.identity;
  const sectorInstructionsSection = input.verticalOverlay?.instructions.trim() || 'Sin adaptación de sector aplicada.';
  const clientPoliciesSection = input.clientLayer.trim() || 'Sin personalización de cliente todavía.';
  const combinedSafetyNotes = [...input.safetyNotes, ...(input.verticalOverlay?.safetyNotes ?? [])];
  const safetyLimitsSection = combinedSafetyNotes.length > 0 ? combinedSafetyNotes.map((note) => `- ${note}`).join('\n') : 'Sin límites adicionales.';
  const outputFormatSection = OUTPUT_FORMAT_SECTION;

  const compiledText = [
    `# Identidad y función\n${identitySection}\n\n${input.baseInstructions}`,
    `# Instrucciones del sector\n${sectorInstructionsSection}`,
    `# Políticas del cliente\n${clientPoliciesSection}`,
    `# Límites de seguridad\n${safetyLimitsSection}`,
    `# Formato de salida\n${outputFormatSection}`,
  ].join('\n\n');

  return { identitySection, sectorInstructionsSection, clientPoliciesSection, safetyLimitsSection, outputFormatSection, compiledText };
}

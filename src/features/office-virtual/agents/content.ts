import { type AgentInput, ContentAssetSchema, type ContentAsset } from '../schemas';
import type { AgentRunner, RunnerContext } from './types';

export const contentAgent: AgentRunner<AgentInput, ContentAsset> = {
  id: 'content',
  promptVersion: 'v1',
  async run({ text, context }, _ctx: RunnerContext) {
    const niche = (context?.lead as { niche?: string } | undefined)?.niche;

    const asset: ContentAsset = {
      targetAudience: niche ? `Negocios de ${niche.toLowerCase()}` : 'Potenciales clientes de la agencia',
      angle: 'Caso práctico: de un problema real a una solución en semanas',
      draftAsset: `Post: "${text.trim().slice(0, 160)}" — así lo resolvimos, paso a paso.`,
      cta: 'Habla con nosotros si te pasa algo parecido.',
      repurposingIdeas: ['Hilo para redes', 'Guion corto para reel', 'Bloque para newsletter'],
    };

    return ContentAssetSchema.parse(asset);
  },
};

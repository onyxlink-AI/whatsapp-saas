import { AGENT_META } from '../../agents/registry';
import type {
  AgentId,
  ContentAsset,
  CoordinatorDecision,
  LeadBrief,
  OpsPlan,
  ProposalDraft,
  QAResult,
  StrategyBrief,
} from '../../schemas';

function displayName(id: AgentId | 'human' | 'done'): string {
  if (id === 'human') return 'una persona del equipo';
  if (id === 'done') return 'nadie más: el workflow terminó';
  return `${AGENT_META[id].name} (${AGENT_META[id].department})`;
}

function bullets(lines: string[]): string {
  return lines.map((l) => `• ${l}`).join('\n');
}

/** Turns a structured agent output (schemas/*) into a readable chat reply. */
export function formatOfficeReply(agentId: AgentId, output: unknown): string {
  if (output && typeof output === 'object' && 'blockedReason' in output) {
    return `⏳ ${(output as { blockedReason: string }).blockedReason}`;
  }

  switch (agentId) {
    case 'coordinator': {
      const d = output as CoordinatorDecision;
      return `Te derivo a ${displayName(d.nextAgent)}.\nMotivo: ${d.reason}\nContrato esperado: ${d.expectedSchema}${
        d.requiresApproval ? '\n⚠️ Requiere aprobación humana.' : ''
      }`;
    }
    case 'lead-intake': {
      const l = output as LeadBrief;
      return bullets([
        `Resumen: ${l.summary}`,
        `Nicho: ${l.niche}`,
        `Canal: ${l.channel}`,
        `Dolor: ${l.painPoints.join('; ')}`,
        `Urgencia: ${l.urgency}`,
        `Confianza: ${Math.round(l.confidence * 100)}%`,
        ...(l.missingInfo.length ? [`Falta por confirmar: ${l.missingInfo.join(', ')}`] : []),
      ]);
    }
    case 'strategy': {
      const s = output as StrategyBrief;
      return bullets([
        `Solución recomendada: ${s.recommendedSolution}`,
        `Por qué: ${s.rationale}`,
        `Stack: ${s.stack.join(', ')}`,
        `Riesgos: ${s.risks.join('; ')}`,
        `Requisitos previos: ${s.prerequisites.join('; ')}`,
        `Criterios de éxito: ${s.successCriteria.join('; ')}`,
      ]);
    }
    case 'proposal': {
      const p = output as ProposalDraft;
      return bullets([
        `Oferta: ${p.offerSummary}`,
        `Alcance: ${p.scope.join(', ')}`,
        `Exclusiones: ${p.exclusions.join(', ')}`,
        `Plazo: ${p.timeline}`,
        `Precio único: ${p.oneOffPrice} €`,
        `Mantenimiento mensual: ${p.recurringMaintenancePrice} €`,
        `Siguientes pasos: ${p.nextSteps.join(' → ')}`,
      ]);
    }
    case 'operations': {
      const o = output as OpsPlan;
      return bullets([
        ...o.phases.map((ph) => `${ph.name}: ${ph.description}`),
        `Hitos: ${o.milestones.join(', ')}`,
        `Checklist de entrega: ${o.deliveryChecklist.join(', ')}`,
      ]);
    }
    case 'content': {
      const c = output as ContentAsset;
      return bullets([
        `Audiencia: ${c.targetAudience}`,
        `Ángulo: ${c.angle}`,
        `Borrador: ${c.draftAsset}`,
        `CTA: ${c.cta}`,
        `Ideas de reaprovechamiento: ${c.repurposingIdeas.join(', ')}`,
      ]);
    }
    case 'review-qa': {
      const q = output as QAResult;
      const header = q.pass ? '✅ Pasa QA' : '❌ No pasa QA';
      if (q.issues.length === 0) return `${header}\n${q.releaseRecommendation}`;
      return `${header}\n${bullets(q.issues.map((i) => `[${i.severity}] ${i.description}`))}\n${q.releaseRecommendation}`;
    }
  }
}

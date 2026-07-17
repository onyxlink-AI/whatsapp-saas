import type { SkillCommand, SkillDefinition } from './types';

const ACTOR = { actorId: 'demo-admin', role: 'workspace_admin' as const, workspaceId: 'workspace-demo' };

const followUpDefinition: SkillDefinition = {
  objective: 'Preparar un seguimiento comercial consistente a partir del contexto disponible.',
  triggers: [{ id: 'follow-trigger-inactive', type: 'event', description: 'Oportunidad sin respuesta durante 48 horas' }],
  inputs: [
    { id: 'follow-input-contact', name: 'Contacto', description: 'Perfil autorizado del contacto.', required: true },
    { id: 'follow-input-history', name: 'Historial reciente', description: 'Últimas interacciones disponibles.', required: true },
    { id: 'follow-input-stage', name: 'Estado de la oportunidad', description: 'Fase comercial actual.', required: true },
  ],
  tools: [
    { id: 'follow-tool-memory', name: 'contact_memory', description: 'Consulta memoria autorizada.', allowed: true },
    { id: 'follow-tool-draft', name: 'draft_message', description: 'Genera un borrador sin enviarlo.', allowed: true },
  ],
  steps: [
    { id: 'follow-step-context', order: 1, title: 'Revisar el contexto autorizado', description: '', toolId: 'follow-tool-memory' },
    { id: 'follow-step-draft', order: 2, title: 'Redactar el seguimiento', description: '', toolId: 'follow-tool-draft' },
    { id: 'follow-step-review', order: 3, title: 'Comprobar tono y datos', description: '', toolId: null },
    { id: 'follow-step-approval', order: 4, title: 'Solicitar aprobación antes del envío', description: '', toolId: null },
  ],
  outputs: [{ id: 'follow-output-draft', name: 'Borrador de seguimiento', description: 'Borrador listo para revisión humana.' }],
  approval: { policy: 'always', note: 'El envío debe aprobarlo una persona administradora.' },
};

const qaDefinition: SkillDefinition = {
  objective: 'Revisar entregables antes de su aprobación final.',
  triggers: [{ id: 'qa-trigger-ready', type: 'event', description: 'Una propuesta cambia a lista para revisión' }],
  inputs: [
    { id: 'qa-input-deliverable', name: 'Entregable', description: '', required: true },
    { id: 'qa-input-criteria', name: 'Criterios de calidad', description: '', required: true },
  ],
  tools: [
    { id: 'qa-tool-files', name: 'read_files', description: 'Lee archivos autorizados.', allowed: true },
    { id: 'qa-tool-task', name: 'create_task', description: 'Registra una corrección como tarea.', allowed: true },
  ],
  steps: [
    { id: 'qa-step-structure', order: 1, title: 'Validar estructura', description: '', toolId: 'qa-tool-files' },
    { id: 'qa-step-coherence', order: 2, title: 'Comprobar coherencia', description: '', toolId: 'qa-tool-files' },
    { id: 'qa-step-issues', order: 3, title: 'Registrar incidencias', description: '', toolId: 'qa-tool-task' },
  ],
  outputs: [{ id: 'qa-output-report', name: 'Informe de revisión', description: 'Resultado y acciones correctivas.' }],
  approval: { policy: 'sensitive_only', note: 'Solo requiere aprobación si genera acciones externas sensibles.' },
};

export function createSkillFixtures(workspaceId = 'workspace-demo'): SkillCommand[] {
  const actor = { ...ACTOR, workspaceId };
  return [
    { type: 'skill.candidate_created', commandId: 'skill-fixture-candidate', skillId: 'skill-follow-up', workspaceId, actor: { actorId: 'proposal-agent', role: 'agent', workspaceId, agentId: 'proposal' }, occurredAt: '2026-07-15T09:00:00.000Z', name: 'Seguimiento comercial contextual', description: 'Candidata detectada tras cinco ejecuciones similares.', ownerAgentId: 'proposal', definition: followUpDefinition, evidenceTaskIds: ['task-follow-up-1', 'task-follow-up-2', 'task-follow-up-3', 'task-follow-up-4', 'task-follow-up-5'], detectedOccurrences: 5 },
    { type: 'skill.test_recorded', commandId: 'skill-fixture-candidate-test', skillId: 'skill-follow-up', workspaceId, expectedRevision: 1, actor: { actorId: 'proposal-agent', role: 'agent', workspaceId, agentId: 'proposal' }, occurredAt: '2026-07-15T09:04:00.000Z', testRunId: 'test-follow-up-1', status: 'passed', durationMs: 1840, estimatedCostUsd: 0.012, trace: [
      { stepId: 'follow-step-context', label: 'Revisar el contexto autorizado', status: 'passed', detail: 'Datos de prueba aislados y sin información sensible real.' },
      { stepId: 'follow-step-draft', label: 'Redactar el seguimiento', status: 'passed', detail: 'Borrador generado dentro de las acciones permitidas.' },
      { stepId: 'follow-step-approval', label: 'Solicitar aprobación antes del envío', status: 'passed', detail: 'El envío quedó bloqueado a la espera de revisión humana.' },
    ] },
    { type: 'skill.created', commandId: 'skill-fixture-qa', skillId: 'skill-quality-review', workspaceId, actor, occurredAt: '2026-07-15T09:10:00.000Z', name: 'Control de calidad de entregables', description: 'Revisión estructurada antes de entregar.', risk: 'medium', ownerAgentId: 'review-qa', assignedAgentIds: ['review-qa', 'coordinator'], definition: qaDefinition },
    { type: 'skill.test_recorded', commandId: 'skill-fixture-qa-test', skillId: 'skill-quality-review', workspaceId, expectedRevision: 1, actor, occurredAt: '2026-07-15T09:12:00.000Z', testRunId: 'test-quality-1', status: 'passed', durationMs: 960, estimatedCostUsd: 0.008, trace: [
      { stepId: 'qa-step-structure', label: 'Validar estructura', status: 'passed', detail: 'El entregable de prueba cumple el formato esperado.' },
      { stepId: 'qa-step-issues', label: 'Registrar incidencias', status: 'passed', detail: 'Informe generado sin ejecutar acciones externas.' },
    ] },
    { type: 'skill.approved', commandId: 'skill-fixture-qa-approve', skillId: 'skill-quality-review', workspaceId, expectedRevision: 2, actor, occurredAt: '2026-07-15T09:14:00.000Z' },
    { type: 'skill.published', commandId: 'skill-fixture-qa-publish', skillId: 'skill-quality-review', workspaceId, expectedRevision: 3, actor, occurredAt: '2026-07-15T09:16:00.000Z' },
    { type: 'skill.metrics_recorded', commandId: 'skill-fixture-qa-metrics-1', skillId: 'skill-quality-review', workspaceId, expectedRevision: 4, actor: { actorId: 'skills-runtime', role: 'system', workspaceId }, occurredAt: '2026-07-15T10:00:00.000Z', successful: true, durationMs: 2100, estimatedMinutesSaved: 12, costUsd: 0.015 },
  ];
}

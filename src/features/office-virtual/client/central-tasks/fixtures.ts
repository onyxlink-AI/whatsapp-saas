import type { TaskCommand } from './types';

export function createTaskFixtures(workspaceId = 'workspace-demo'): TaskCommand[] {
  return [
    {
      type: 'task.created', commandId: 'task-command-1', taskId: 'task-follow-up', workspaceId,
      actor: { actorId: 'admin-demo', role: 'workspace_admin' }, occurredAt: '2026-07-15T08:00:00.000Z',
      title: 'Preparar seguimiento comercial', description: 'Revisar la conversación y proponer el siguiente paso.',
      priority: 'high', source: 'whatsapp', assignedAgentId: 'proposal', contactId: 'contact-lucia',
      dueAt: '2026-07-16T10:00:00.000Z', requiresApproval: true,
    },
    {
      type: 'task.created', commandId: 'task-command-2', taskId: 'task-call-summary', workspaceId,
      actor: { actorId: 'voice-agent', role: 'agent' }, occurredAt: '2026-07-15T08:15:00.000Z',
      title: 'Resumir llamada de descubrimiento', priority: 'normal', source: 'voice',
      assignedAgentId: 'content', contactId: 'contact-mario', requiresApproval: false,
    },
  ];
}

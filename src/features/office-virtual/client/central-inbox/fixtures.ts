import { adaptSaasContact360, createSaasContact360Fixture } from '../central-contacts';
import type { InboxProjectionInput } from './adapter';

export function createInboxProjectionFixture(): InboxProjectionInput {
  const contactResult = adaptSaasContact360(createSaasContact360Fixture());
  if (!contactResult.success) throw new Error('The Contact360 fixture must be valid');

  return {
    contact: contactResult.contact,
    messages: [
      {
        id: 'message-000',
        workspaceId: 'workspace-demo',
        conversationId: 'conversation-001',
        direction: 'out',
        body: 'Hola Lucía, podemos ayudarte a unificar la atención de tu clínica.',
        status: 'read',
        occurredAt: '2026-07-14T15:05:00.000Z',
      },
      {
        id: 'message-001',
        workspaceId: 'workspace-demo',
        conversationId: 'conversation-001',
        direction: 'in',
        body: 'Quiero automatizar WhatsApp y las llamadas de la clínica.',
        status: 'read',
        occurredAt: '2026-07-14T15:10:00.000Z',
      },
    ],
    voiceCalls: [
      {
        id: 'voice-call-001',
        workspaceId: 'workspace-demo',
        contactId: 'contact-lucia',
        callStatus: 'ended',
        durationSeconds: 183,
        summary: 'Busca atención multicanal para su clínica.',
        endedReason: 'customer-ended-call',
        occurredAt: '2026-07-14T14:00:00.000Z',
      },
    ],
  };
}

import type { VapiOutboundCallRequest, VoiceCallJob } from './types';

/**
 * Builds the server-side Vapi request. Authorization headers and the API key
 * belong to the backend adapter and can never be represented by this contract.
 */
export function buildVapiAppointmentReminderRequest(job: VoiceCallJob): VapiOutboundCallRequest {
  if (job.status !== 'queued') throw new Error('voice_job_not_queued');
  return {
    assistantId: job.assistantId,
    phoneNumberId: job.phoneNumberId,
    customer: { number: job.customerNumber, name: job.contactDisplayName },
    assistantOverrides: {
      variableValues: {
        purpose: job.purpose,
        customerName: job.contactDisplayName,
        appointmentAt: job.appointmentAt,
        contactId: job.contactId,
        appointmentId: job.appointmentId,
        voiceJobId: job.id,
      },
    },
    metadata: {
      workspaceId: job.workspaceId,
      voiceJobId: job.id,
      requestId: job.requestId,
      contactId: job.contactId,
      appointmentId: job.appointmentId,
    },
  };
}

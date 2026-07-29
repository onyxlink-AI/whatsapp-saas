import type { WorkspaceCapabilitySnapshot } from '../central-integrations/types';
import type { WorkspaceWhatsAppBinding } from '../central-integrations/whatsapp-binding';

export type WorkspaceCapabilitySnapshotResult =
  | { status: 'ok'; snapshot: WorkspaceCapabilitySnapshot; whatsappBinding: WorkspaceWhatsAppBinding }
  | { status: 'error'; message: string };

export type SetOfficeVirtualEnabledResult =
  | { status: 'ok'; enabled: boolean }
  | { status: 'error'; message: string };

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** Browser transport for the real per-workspace capability snapshot (Activación). */
export async function fetchWorkspaceCapabilitySnapshot(
  workspaceId: string,
): Promise<WorkspaceCapabilitySnapshotResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/capability-snapshot`);
    if (!response.ok) return { status: 'error', message: await readError(response) };
    const body = (await response.json()) as { snapshot: WorkspaceCapabilitySnapshot; whatsappBinding: WorkspaceWhatsAppBinding };
    return { status: 'ok', snapshot: body.snapshot, whatsappBinding: body.whatsappBinding };
  } catch {
    return { status: 'error', message: 'No se pudo leer el estado real del workspace.' };
  }
}

/** Reuses the existing office_virtual_enabled toggle route — never a second activation flag. */
export async function setOfficeVirtualEnabled(
  workspaceId: string,
  enabled: boolean,
): Promise<SetOfficeVirtualEnabledResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) return { status: 'error', message: await readError(response) };
    const body = (await response.json()) as { enabled: boolean };
    return { status: 'ok', enabled: body.enabled };
  } catch {
    return { status: 'error', message: 'No se pudo contactar con el backend de activación.' };
  }
}

/** Starts/stops the configured WhatsApp profile from Oficina Virtual. */
export async function setOfficeWhatsAppEnabled(
  workspaceId: string,
  enabled: boolean,
): Promise<SetOfficeVirtualEnabledResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'whatsapp', enabled }),
    });
    if (!response.ok) return { status: 'error', message: await readError(response) };
    const body = (await response.json()) as { enabled: boolean };
    return { status: 'ok', enabled: body.enabled };
  } catch {
    return { status: 'error', message: 'No se pudo cambiar el estado del Agente de WhatsApp.' };
  }
}

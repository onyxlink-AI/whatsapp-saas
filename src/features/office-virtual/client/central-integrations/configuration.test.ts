import { describe, expect, it } from 'vitest';
import {
  applyOfficeConfigurationCommand,
  createOfficeConfigurationDocument,
  validateOfficeConfiguration,
  type OfficeConfigurationCommand,
  type OfficeConfigurationDocument,
} from './configuration';
import { provisionWorkspaceOffice } from './preset';
import { CONFIGURABLE_AGENT_IDS } from './specialist-seats';
import { findSpecialistTemplate, SPECIALIST_TEMPLATES } from './specialist-templates';
import type { OfficeViewer } from './types';

const WORKSPACE = 'workspace-test';
const NOW = '2026-07-22T12:00:00.000Z';
const SUPER_ADMIN: OfficeViewer = { actorId: 'admin@onyxlink.test', role: 'onyxlink_super_admin', workspaceId: WORKSPACE };
const WORKSPACE_ADMIN: OfficeViewer = { actorId: 'client-admin@test', role: 'workspace_admin', workspaceId: WORKSPACE };

function freshDocument(): OfficeConfigurationDocument {
  const provisioned = provisionWorkspaceOffice(WORKSPACE, NOW);
  return createOfficeConfigurationDocument(provisioned, SUPER_ADMIN.actorId, NOW);
}

function baseCommand(overrides: Partial<OfficeConfigurationCommand> & { type: OfficeConfigurationCommand['type'] }) {
  return {
    workspaceId: WORKSPACE,
    actor: SUPER_ADMIN,
    occurredAt: NOW,
    ...overrides,
  } as OfficeConfigurationCommand;
}

describe('office configuration document — provisioning', () => {
  it('provisions a fresh document with 8 disabled, unconfigured specialist seats', () => {
    const document = freshDocument();
    expect(document.revision).toBe(1);
    expect(document.status).toBe('draft');
    expect(document.sectorId).toBeNull();
    for (const agentId of CONFIGURABLE_AGENT_IDS) {
      const specialist = document.specialists[agentId];
      expect(specialist.enabled).toBe(false);
      expect(specialist.templateId).toBeNull();
    }
  });
});

describe('office configuration — save and reload', () => {
  it('accumulates revisions across sequential commands, and the final document reflects every change (equivalent to reload)', () => {
    let document = freshDocument();

    const renamed = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_office', expectedRevision: document.revision, displayName: 'Oficina de Prueba' }),
    );
    expect(renamed.success).toBe(true);
    if (!renamed.success) return;
    document = renamed.document;
    expect(document.revision).toBe(2);
    expect(document.officeDisplayName).toBe('Oficina de Prueba');

    // Simulate "reload": a brand-new document object built the same way a server GET would return it.
    const reloaded: OfficeConfigurationDocument = JSON.parse(JSON.stringify(document));
    expect(reloaded.officeDisplayName).toBe('Oficina de Prueba');
    expect(reloaded.revision).toBe(2);
  });
});

describe('office configuration — draft vs publish', () => {
  it('stays draft after edits and only becomes published on an explicit publish command', () => {
    const document = freshDocument();
    const edited = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_office', expectedRevision: document.revision, displayName: 'Nombre nuevo' }),
    );
    expect(edited.success).toBe(true);
    if (!edited.success) return;
    expect(edited.document.status).toBe('draft');

    const published = applyOfficeConfigurationCommand(
      edited.document,
      baseCommand({ type: 'publish', expectedRevision: edited.document.revision }),
    );
    expect(published.success).toBe(true);
    if (!published.success) return;
    expect(published.document.status).toBe('published');
  });

  it('editing a published configuration reverts it to draft (never silently stays published with unreviewed changes)', () => {
    const document = freshDocument();
    const published = applyOfficeConfigurationCommand(document, baseCommand({ type: 'publish', expectedRevision: document.revision }));
    if (!published.success) throw new Error('expected publish to succeed');

    const edited = applyOfficeConfigurationCommand(
      published.document,
      baseCommand({ type: 'update_office', expectedRevision: published.document.revision, displayName: 'Cambio tras publicar' }),
    );
    expect(edited.success).toBe(true);
    if (!edited.success) return;
    expect(edited.document.status).toBe('draft');
  });
});

describe('office configuration — stale revision (concurrent edits)', () => {
  it('rejects a command whose expectedRevision no longer matches the current document', () => {
    const document = freshDocument();
    const first = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_office', expectedRevision: document.revision, displayName: 'Editor A' }),
    );
    expect(first.success).toBe(true);
    if (!first.success) return;

    // Editor B loaded the office before Editor A saved (still holding the
    // original, now-stale revision number) and submits against the
    // document as it stands after A's save.
    const second = applyOfficeConfigurationCommand(
      first.document,
      baseCommand({ type: 'update_office', expectedRevision: document.revision, displayName: 'Editor B' }),
    );
    expect(second.success).toBe(false);
    if (second.success) return;
    expect(second.code).toBe('stale_revision');
  });
});

describe('office configuration — restore revision', () => {
  it('restores officeDisplayName and specialists from a prior document without reusing its revision number', () => {
    const document = freshDocument();
    const revision1Snapshot = document;

    const renamed = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_office', expectedRevision: document.revision, displayName: 'Nombre cambiado' }),
    );
    if (!renamed.success) throw new Error('expected update to succeed');

    const restored = applyOfficeConfigurationCommand(
      renamed.document,
      baseCommand({ type: 'restore_revision', expectedRevision: renamed.document.revision, revision: 1, sourceDocument: revision1Snapshot }),
    );
    expect(restored.success).toBe(true);
    if (!restored.success) return;
    expect(restored.document.officeDisplayName).toBe(revision1Snapshot.officeDisplayName);
    expect(restored.document.revision).toBe(3); // new revision, not a rewind
  });

  it('rejects restoring a source document whose revision does not match the requested one', () => {
    const document = freshDocument();
    const restored = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'restore_revision', expectedRevision: document.revision, revision: 99, sourceDocument: document }),
    );
    expect(restored.success).toBe(false);
    if (restored.success) return;
    expect(restored.code).toBe('revision_mismatch');
  });
});

describe('office configuration — reset specialist', () => {
  it('resets a configured seat back to blank defaults, never removing its room', () => {
    const document = freshDocument();
    const template = SPECIALIST_TEMPLATES[0];
    const applied = applyOfficeConfigurationCommand(
      document,
      baseCommand({
        type: 'update_specialist',
        expectedRevision: document.revision,
        agentId: 'specialist-1',
        patch: { enabled: true, templateId: template.id, name: template.name },
        openRouterConnected: true,
      }),
    );
    if (!applied.success) throw new Error('expected update to succeed');
    expect(applied.document.specialists['specialist-1'].enabled).toBe(true);

    const reset = applyOfficeConfigurationCommand(
      applied.document,
      baseCommand({ type: 'reset_specialist', expectedRevision: applied.document.revision, agentId: 'specialist-1' }),
    );
    expect(reset.success).toBe(true);
    if (!reset.success) return;
    expect(reset.document.specialists['specialist-1'].enabled).toBe(false);
    expect(reset.document.specialists['specialist-1'].templateId).toBeNull();
  });

  it('rejects touching a protected seat (coordinator, WhatsApp, voice, chatbot)', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'reset_specialist', expectedRevision: document.revision, agentId: 'coordinator' }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('protected_seat');
  });
});

describe('office configuration — the 8 specialist templates', () => {
  it('has exactly the 8 required business-role templates', () => {
    const ids = SPECIALIST_TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        'gestor-de-empresa',
        'administrativo-financiero',
        'comercial-growth',
        'atencion-cliente-cs',
        'operaciones-proyectos',
        'personas-rrhh',
        'datos-bi',
        'ciberseguridad-cumplimiento',
      ].sort(),
    );
  });

  it.each(SPECIALIST_TEMPLATES.map((t) => t.id))('applying template "%s" to a seat pre-fills the editable fields only', (templateId) => {
    const document = freshDocument();
    const template = findSpecialistTemplate(templateId)!;
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({
        type: 'update_specialist',
        expectedRevision: document.revision,
        agentId: 'specialist-1',
        patch: {
          templateId: template.id,
          name: template.name,
          function: template.function,
          objective: template.objective,
          instructions: template.instructions,
          allowedActions: template.allowedActions,
          approvalPolicy: template.approvalPolicy,
        },
        openRouterConnected: false,
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const specialist = result.document.specialists['specialist-1'];
    expect(specialist.templateId).toBe(template.id);
    expect(specialist.name).toBe(template.name);
    // Applying a template never auto-activates the seat.
    expect(specialist.enabled).toBe(false);
  });
});

describe('office configuration — instruction layering (BASE < SECTOR < CLIENTE)', () => {
  it('preserves the client layer independently of the base instructions field, and it survives a reload', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({
        type: 'update_specialist',
        expectedRevision: document.revision,
        agentId: 'specialist-2',
        patch: { clientLayer: 'Este cliente exige confirmar por escrito antes de cualquier envío.' },
        openRouterConnected: true,
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const reloaded: OfficeConfigurationDocument = JSON.parse(JSON.stringify(result.document));
    expect(reloaded.specialists['specialist-2'].clientLayer).toBe('Este cliente exige confirmar por escrito antes de cualquier envío.');
  });
});

describe('office configuration — authorization', () => {
  it('rejects a command from a non-superadmin actor', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      { ...baseCommand({ type: 'update_office', expectedRevision: document.revision, displayName: 'x' }), actor: WORKSPACE_ADMIN },
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('unauthorized');
  });

  it('rejects a command whose workspaceId does not match the document', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_office', workspaceId: 'workspace-other', expectedRevision: document.revision, displayName: 'x' }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('workspace_mismatch');
  });
});

describe('office configuration — no secrets', () => {
  it('the document and validation issues never contain credential-shaped fields', () => {
    const document = freshDocument();
    const serialized = JSON.stringify(document).toLowerCase();
    expect(serialized).not.toMatch(/api[_-]?key|token|secret|password|credential/);
    expect(validateOfficeConfiguration(document)).toEqual([]);
  });
});

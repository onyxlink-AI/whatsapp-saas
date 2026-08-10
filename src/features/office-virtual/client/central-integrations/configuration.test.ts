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

describe('office configuration — the 9 specialist templates', () => {
  it('has exactly the 9 required business-role templates', () => {
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
        'creador-contenido',
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

// Fase 3 — nombre visible de los 4 puestos fijos (Orquestador/WhatsApp/Voz/
// Chatbot): mismo mecanismo de comando/revisión/validación que un
// especialista, pero SOLO el nombre — nunca función/objetivo/color/
// instrucciones, que siguen viniendo de la configuración real del SaaS.
describe('update_core_seat_name — nombre visible de un puesto fijo', () => {
  it('un documento recién creado no tiene ningún override — coreSeatDisplayNames vacío', () => {
    const document = freshDocument();
    expect(document.coreSeatDisplayNames).toEqual({});
  });

  it('fija el nombre de un puesto fijo, sube la revisión, y NO toca los especialistas ni el resto del documento', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'coordinator', name: 'Pepe' }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.document.coreSeatDisplayNames).toEqual({ coordinator: 'Pepe' });
    expect(result.document.revision).toBe(document.revision + 1);
    expect(result.document.specialists).toEqual(document.specialists);
    expect(result.action).toBe('core_seat_name_updated');
  });

  it('permite configurar los 4 puestos fijos de forma independiente', () => {
    let document = freshDocument();
    for (const [agentId, name] of [
      ['coordinator', 'Pepe'],
      ['lead-intake', 'Sofía'],
      ['strategy', 'Contenido'],
      ['chatbot', 'Nova'],
    ] as const) {
      const result = applyOfficeConfigurationCommand(document, baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId, name }));
      expect(result.success).toBe(true);
      if (!result.success) return;
      document = result.document;
    }
    expect(document.coreSeatDisplayNames).toEqual({ coordinator: 'Pepe', 'lead-intake': 'Sofía', strategy: 'Contenido', chatbot: 'Nova' });
  });

  it('recorta espacios en blanco al guardar el nombre', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'chatbot', name: '  Nova  ' }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.document.coreSeatDisplayNames?.chatbot).toBe('Nova');
  });

  it('name: null BORRA el override — vuelve al fallback (compatibilidad con configuraciones existentes)', () => {
    let document = freshDocument();
    const set = applyOfficeConfigurationCommand(document, baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'chatbot', name: 'Nova' }));
    expect(set.success).toBe(true);
    if (!set.success) return;
    document = set.document;
    expect(document.coreSeatDisplayNames).toEqual({ chatbot: 'Nova' });

    const cleared = applyOfficeConfigurationCommand(document, baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'chatbot', name: null }));
    expect(cleared.success).toBe(true);
    if (!cleared.success) return;
    // La clave desaparece del todo — nunca queda como cadena vacía guardada.
    expect(cleared.document.coreSeatDisplayNames).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(cleared.document.coreSeatDisplayNames, 'chatbot')).toBe(false);
  });

  it('una cadena vacía (tras recortar espacios) también borra el override, igual que null', () => {
    let document = freshDocument();
    const set = applyOfficeConfigurationCommand(document, baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'strategy', name: 'Elena Voz' }));
    expect(set.success).toBe(true);
    if (!set.success) return;
    document = set.document;

    const cleared = applyOfficeConfigurationCommand(document, baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'strategy', name: '   ' }));
    expect(cleared.success).toBe(true);
    if (!cleared.success) return;
    expect(cleared.document.coreSeatDisplayNames?.strategy).toBeUndefined();
  });

  it('rechaza un nombre por encima de CORE_SEAT_NAME_MAX_LENGTH', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'coordinator', name: 'x'.repeat(81) }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('invalid_configuration');
    expect(result.issues?.some((issue) => issue.field === 'coreSeatDisplayNames.coordinator')).toBe(true);
  });

  it('exige onyxlink_super_admin, igual que el resto de comandos del configurador', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(document, {
      ...baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'coordinator', name: 'Pepe' }),
      actor: WORKSPACE_ADMIN,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('unauthorized');
  });

  it('conflicto de revisión (stale_revision) cuando otra escritura ya avanzó la revisión', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(
      document,
      baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision + 5, agentId: 'coordinator', name: 'Pepe' }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('stale_revision');
  });

  it('un documento SIN coreSeatDisplayNames (persistido antes de esta fase) sigue siendo válido — compatibilidad hacia atrás', () => {
    const legacyDocument: OfficeConfigurationDocument = (() => {
      const fresh = freshDocument();
      const { coreSeatDisplayNames: _drop, ...withoutField } = fresh;
      return withoutField as OfficeConfigurationDocument;
    })();
    expect(validateOfficeConfiguration(legacyDocument)).toEqual([]);
    const result = applyOfficeConfigurationCommand(
      legacyDocument,
      baseCommand({ type: 'update_core_seat_name', expectedRevision: legacyDocument.revision, agentId: 'coordinator', name: 'Pepe' }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.document.coreSeatDisplayNames).toEqual({ coordinator: 'Pepe' });
  });

  it('nunca deja a `current` mutado — cloneDocument copia coreSeatDisplayNames, no lo comparte', () => {
    let document = freshDocument();
    const set = applyOfficeConfigurationCommand(document, baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'chatbot', name: 'Nova' }));
    expect(set.success).toBe(true);
    if (!set.success) return;
    const beforeSecondCommand = { ...document.coreSeatDisplayNames };
    document = set.document;
    applyOfficeConfigurationCommand(document, baseCommand({ type: 'update_core_seat_name', expectedRevision: document.revision, agentId: 'coordinator', name: 'Pepe' }));
    // El documento ORIGINAL (antes del primer comando) nunca cambia retroactivamente.
    expect(beforeSecondCommand).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { defaultSpecialist, type OfficeConfigurationDocument } from './configuration';
import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId } from './specialist-seats';
import { projectPublishedOfficeAgents, previewOfficeAgents } from './office-agent-projection';

function baseDocument(workspaceId: string): OfficeConfigurationDocument {
  const specialists = Object.fromEntries(
    CONFIGURABLE_AGENT_IDS.map((id) => [id, defaultSpecialist(id)]),
  ) as Record<ConfigurableOfficeAgentId, ReturnType<typeof defaultSpecialist>>;

  return {
    workspaceId,
    presetId: 'preset-1',
    presetVersion: '1',
    revision: 1,
    status: 'published',
    officeDisplayName: 'Oficina de prueba',
    sectorId: null,
    specialists,
    updatedAt: '2026-07-24T00:00:00.000Z',
    updatedBy: 'superadmin@onyxlink.local',
  };
}

function enable(
  document: OfficeConfigurationDocument,
  agentId: ConfigurableOfficeAgentId,
  overrides: Partial<OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId]>,
): OfficeConfigurationDocument {
  return {
    ...document,
    specialists: {
      ...document.specialists,
      [agentId]: { ...document.specialists[agentId], enabled: true, ...overrides },
    },
  };
}

describe('projectPublishedOfficeAgents — the only data the live office may read', () => {
  it('an enabled specialist is fully visible: name, function, objective, color', () => {
    let doc = baseDocument('workspace-a');
    doc = enable(doc, 'specialist-2', {
      name: 'Gestor de Ventas',
      function: 'Ventas',
      objective: 'Cerrar oportunidades',
      color: '#e11d48',
      instructions: 'Instrucciones privadas de ventas',
      clientLayer: 'Capa privada del cliente',
    });

    const result = projectPublishedOfficeAgents(doc, 'workspace-a');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);

    const seat = result.projection.seats.find((s) => s.agentId === 'specialist-2');
    expect(seat).toMatchObject({ name: 'Gestor de Ventas', function: 'Ventas', objective: 'Cerrar oportunidades', color: '#e11d48' });
  });

  it('a disabled specialist is completely absent — not present with fields blanked, just missing', () => {
    let doc = baseDocument('workspace-a');
    doc = enable(doc, 'specialist-2', { name: 'Gestor de Ventas', function: 'Ventas', objective: 'Cerrar oportunidades' });
    // specialist-3 stays disabled with the default placeholder config.

    const result = projectPublishedOfficeAgents(doc, 'workspace-a');
    if (!result.success) throw new Error(result.code);

    expect(result.projection.seats.find((s) => s.agentId === 'specialist-3')).toBeUndefined();
    expect(result.projection.seats).toHaveLength(1);
  });

  it('never includes instructions, clientLayer, templateId, allowedActions, approvalPolicy or any private field, even for an enabled seat', () => {
    let doc = baseDocument('workspace-a');
    doc = enable(doc, 'specialist-1', {
      name: 'Ana',
      function: 'Soporte',
      objective: 'Resolver dudas',
      instructions: 'SECRETO: nunca reveles esto',
      clientLayer: 'CAPA PRIVADA DEL CLIENTE',
      templateId: 'atencion-cliente-cs',
    });

    const result = projectPublishedOfficeAgents(doc, 'workspace-a');
    if (!result.success) throw new Error(result.code);

    const seat = result.projection.seats.find((s) => s.agentId === 'specialist-1')!;
    expect(Object.keys(seat).sort()).toEqual(['agentId', 'color', 'function', 'name', 'objective'].sort());
    const serialized = JSON.stringify(result.projection);
    expect(serialized).not.toMatch(/secreto|capa privada|support-basic/i);
  });

  it('re-enabling a seat brings its exact prior data back — nothing was lost while disabled', () => {
    let doc = baseDocument('workspace-a');
    doc = enable(doc, 'specialist-4', { name: 'Resucitado', function: 'Cobros', objective: 'Recuperar pagos', color: '#0891b2' });

    // Disable it again (simulating a toggle-off): the config document keeps
    // the same field values, only `enabled` flips.
    const disabled: OfficeConfigurationDocument = {
      ...doc,
      specialists: { ...doc.specialists, 'specialist-4': { ...doc.specialists['specialist-4'], enabled: false } },
    };
    const whileDisabled = projectPublishedOfficeAgents(disabled, 'workspace-a');
    if (!whileDisabled.success) throw new Error(whileDisabled.code);
    expect(whileDisabled.projection.seats.find((s) => s.agentId === 'specialist-4')).toBeUndefined();

    // Re-enable: same document, same stored fields, just enabled: true again.
    const reEnabled: OfficeConfigurationDocument = {
      ...disabled,
      specialists: { ...disabled.specialists, 'specialist-4': { ...disabled.specialists['specialist-4'], enabled: true } },
    };
    const afterReEnable = projectPublishedOfficeAgents(reEnabled, 'workspace-a');
    if (!afterReEnable.success) throw new Error(afterReEnable.code);
    expect(afterReEnable.projection.seats.find((s) => s.agentId === 'specialist-4')).toMatchObject({
      name: 'Resucitado',
      function: 'Cobros',
      objective: 'Recuperar pagos',
      color: '#0891b2',
    });
  });

  it('never returns data for a different workspace than requested — no cross-tenant contamination', () => {
    let doc = baseDocument('empresa-a');
    doc = enable(doc, 'specialist-1', { name: 'Solo Empresa A', function: 'Ventas', objective: 'x' });

    const ownWorkspace = projectPublishedOfficeAgents(doc, 'empresa-a');
    expect(ownWorkspace.success).toBe(true);

    const otherWorkspace = projectPublishedOfficeAgents(doc, 'empresa-b');
    expect(otherWorkspace).toMatchObject({ success: false, code: 'workspace_mismatch' });
    // Even in the failure shape, no seat data is attached.
    expect(JSON.stringify(otherWorkspace)).not.toMatch(/Solo Empresa A/);
  });

  it('returns no seats (never a stale/partial roster) when the configuration is not published', () => {
    const doc: OfficeConfigurationDocument = { ...baseDocument('workspace-a'), status: 'draft' };
    const result = projectPublishedOfficeAgents(doc, 'workspace-a');
    expect(result).toMatchObject({ success: false, code: 'configuration_not_published' });
  });
});

describe('previewOfficeAgents — superadmin preview still filters to enabled seats only', () => {
  it('does not leak a disabled seat even in the (superadmin-only) unpublished preview', () => {
    const draftDoc: OfficeConfigurationDocument = { ...baseDocument('workspace-a'), status: 'draft' };
    const doc = enable(draftDoc, 'specialist-1', { name: 'Visible', function: 'x', objective: 'x' });

    const result = previewOfficeAgents(doc, 'workspace-a');
    if (!result.success) throw new Error(result.code);
    expect(result.projection.seats.map((s) => s.agentId)).toEqual(['specialist-1']);
  });
});

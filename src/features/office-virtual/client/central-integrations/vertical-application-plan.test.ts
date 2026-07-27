import { describe, expect, it } from 'vitest';
import { applyOfficeConfigurationCommand, createOfficeConfigurationDocument, type OfficeConfigurationDocument } from './configuration';
import { provisionWorkspaceOffice } from './preset';
import { CONFIGURABLE_AGENT_IDS } from './specialist-seats';
import { SPECIALIST_VERTICALS } from './specialist-verticals';
import { createVerticalApplicationPlan } from './vertical-application-plan';
import type { OfficeViewer } from './types';

const WORKSPACE = 'workspace-test';
const NOW = '2026-07-22T12:00:00.000Z';
const SUPER_ADMIN: OfficeViewer = { actorId: 'admin@onyxlink.test', role: 'onyxlink_super_admin', workspaceId: WORKSPACE };

function freshDocument(): OfficeConfigurationDocument {
  const provisioned = provisionWorkspaceOffice(WORKSPACE, NOW);
  return createOfficeConfigurationDocument(provisioned, SUPER_ADMIN.actorId, NOW);
}

describe('the 9 sector configurations', () => {
  it('has exactly the 9 required sectors', () => {
    const ids = SPECIALIST_VERTICALS.map((v) => v.id).sort();
    expect(ids).toEqual(
      [
        'alquiler-barcos',
        'inmobiliaria',
        'compraventa-coches',
        'renting-coches',
        'hoteles',
        'camping',
        'clinica-dental',
        'clinica-estetica',
        'barberia',
      ].sort(),
    );
  });

  it.each(SPECIALIST_VERTICALS.map((v) => v.id))('sector "%s" only recommends templates that exist in the 8-template catalog', (verticalId) => {
    const plan = createVerticalApplicationPlan(verticalId, {}, {});
    expect(plan).not.toBeNull();
    if (!plan) return;
    for (const id of [...plan.recommendedTemplateIds, ...plan.optionalTemplateIds]) {
      expect(id).toMatch(
        /^(gestor-de-empresa|administrativo-financiero|comercial-growth|atencion-cliente-cs|operaciones-proyectos|personas-rrhh|datos-bi|ciberseguridad-cumplimiento)$/,
      );
    }
  });
});

describe('applying a sector proposes workers without activating them', () => {
  it('fills empty seats with the recommended templates, leaving every seat disabled and the document in draft', () => {
    const document = freshDocument();
    const result = applyOfficeConfigurationCommand(document, {
      type: 'apply_vertical',
      workspaceId: WORKSPACE,
      expectedRevision: document.revision,
      actor: SUPER_ADMIN,
      occurredAt: NOW,
      verticalId: 'clinica-dental',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.document.sectorId).toBe('clinica-dental');
    expect(result.document.status).toBe('draft');

    const installed = CONFIGURABLE_AGENT_IDS.filter((id) => result.document.specialists[id].templateId !== null);
    expect(installed.length).toBeGreaterThan(0);
    for (const id of installed) {
      // "No se activa ningún trabajador automáticamente."
      expect(result.document.specialists[id].enabled).toBe(false);
    }
  });

  it('never installs a template into a seat that is already occupied', () => {
    const document = freshDocument();
    const preInstalled = applyOfficeConfigurationCommand(document, {
      type: 'update_specialist',
      workspaceId: WORKSPACE,
      expectedRevision: document.revision,
      actor: SUPER_ADMIN,
      occurredAt: NOW,
      agentId: 'specialist-1',
      patch: { templateId: 'gestor-de-empresa', name: 'Nombre personalizado del cliente' },
      openRouterConnected: true,
    });
    if (!preInstalled.success) throw new Error('expected update to succeed');

    const applied = applyOfficeConfigurationCommand(preInstalled.document, {
      type: 'apply_vertical',
      workspaceId: WORKSPACE,
      expectedRevision: preInstalled.document.revision,
      actor: SUPER_ADMIN,
      occurredAt: NOW,
      verticalId: 'clinica-dental',
    });
    expect(applied.success).toBe(true);
    if (!applied.success) return;
    // The already-occupied seat keeps the client's own name — sector apply never overwrites it.
    expect(applied.document.specialists['specialist-1'].name).toBe('Nombre personalizado del cliente');
  });
});

describe('changing sector never deletes the client instruction layer', () => {
  it('preserves clientLayer text across an apply_vertical command, even on an occupied seat', () => {
    const document = freshDocument();
    const withClientNote = applyOfficeConfigurationCommand(document, {
      type: 'update_specialist',
      workspaceId: WORKSPACE,
      expectedRevision: document.revision,
      actor: SUPER_ADMIN,
      occurredAt: NOW,
      agentId: 'specialist-1',
      patch: { templateId: 'gestor-de-empresa', clientLayer: 'Instrucción propia del cliente — nunca se borra.' },
      openRouterConnected: true,
    });
    if (!withClientNote.success) throw new Error('expected update to succeed');

    const sectorA = applyOfficeConfigurationCommand(withClientNote.document, {
      type: 'apply_vertical',
      workspaceId: WORKSPACE,
      expectedRevision: withClientNote.document.revision,
      actor: SUPER_ADMIN,
      occurredAt: NOW,
      verticalId: 'hoteles',
    });
    if (!sectorA.success) throw new Error('expected apply_vertical to succeed');
    expect(sectorA.document.specialists['specialist-1'].clientLayer).toBe('Instrucción propia del cliente — nunca se borra.');

    const sectorB = applyOfficeConfigurationCommand(sectorA.document, {
      type: 'apply_vertical',
      workspaceId: WORKSPACE,
      expectedRevision: sectorA.document.revision,
      actor: SUPER_ADMIN,
      occurredAt: NOW,
      verticalId: 'barberia',
    });
    if (!sectorB.success) throw new Error('expected apply_vertical to succeed');
    expect(sectorB.document.specialists['specialist-1'].clientLayer).toBe('Instrucción propia del cliente — nunca se borra.');
  });
});

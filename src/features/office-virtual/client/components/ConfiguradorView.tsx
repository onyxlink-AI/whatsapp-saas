import { useState } from 'react';
import { CheckCircle2, ExternalLink, SlidersHorizontal, WandSparkles } from 'lucide-react';
import { STANDARD_OFFICE_PRESET } from '../central-integrations/preset';
import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId } from '../central-integrations/specialist-seats';
import type { OfficeApprovalPolicy, OfficeSpecialistAction } from '../central-integrations/configuration';
import { SPECIALIST_TEMPLATES, findSpecialistTemplate, type SpecialistTemplateId } from '../central-integrations/specialist-templates';
import { ModelPicker } from '@/features/agents/components/model-picker';
import { SPECIALIST_EXTENSIONS, type SpecialistExtension } from '../central-integrations/specialist-extensions';
import { SPECIALIST_SKILLS } from '../central-integrations/specialist-skills';
import { SPECIALIST_VERTICALS, type VerticalId } from '../central-integrations/specialist-verticals';
import { compileEffectiveSpecialistPrompt } from '../central-integrations/specialist-prompt-layers';
import { resolveSpecialistWorkSummary, type CapabilityReadiness } from '../central-integrations/specialist-readiness';
import {
  OPENROUTER_STATUS_ACTIVATES,
  REAL_INTEGRATION_LABELS,
  type OpenRouterStatus,
  type RealIntegrationStatusMap,
} from '../central-integrations/real-integrations';
import type { OfficeConfigurator, SpecialistDraft } from '../hooks/useOfficeConfigurator';
import { relativeTime } from '../lib/relativeTime';
import {
  APPROVAL_POLICY_LABEL_ES,
  CAPABILITY_STATUS_LABEL_ES,
  CAPABILITY_STATUS_TW,
  CONFIGURATION_ERROR_LABEL_ES,
  CONFIGURATION_STATUS_LABEL_ES,
  CONFIGURATION_STATUS_TW,
  SPECIALIST_ACTION_LABEL_ES,
  SPECIALIST_WORK_STATUS_LABEL_ES,
  SPECIALIST_WORK_STATUS_TW,
} from '../lib/officeConfiguratorStyles';
import ViewHeader from './ui/ViewHeader';

type Props = OfficeConfigurator & { demoMode?: boolean };

const ALL_ACTIONS = Object.keys(SPECIALIST_ACTION_LABEL_ES) as OfficeSpecialistAction[];
const ALL_APPROVAL_POLICIES = Object.keys(APPROVAL_POLICY_LABEL_ES) as OfficeApprovalPolicy[];

const PROTECTED_SEATS = STANDARD_OFFICE_PRESET.seats.filter((seat) => !seat.configurable);

/** The one place that turns OpenRouter's 4-state status into what the admin should do about it. */
function openRouterAttentionMessage(status: OpenRouterStatus): string {
  switch (status) {
    case 'not_configured':
      return 'Conecta OpenRouter en Ajustes → Integraciones para poder activarlo.';
    case 'needs_attention':
      return 'La clave de OpenRouter guardada en Ajustes → Integraciones está incompleta. Complétala para poder activarlo.';
    default:
      return '';
  }
}

function ProtectedSeatCard({ displayLabel }: { displayLabel: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm text-white/70">{displayLabel}</div>
        <div className="text-[11px] text-white/30 mt-0.5">Reutiliza la configuración real del SaaS</div>
      </div>
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-white/40 border-white/10 bg-white/[0.03]">Protegido</span>
    </div>
  );
}

function TemplatePicker({ selected, onSelect }: { selected: SpecialistTemplateId | null; onSelect: (id: SpecialistTemplateId) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Plantilla</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {SPECIALIST_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template.id)}
            title={template.summary}
            className={`text-left rounded-md border px-2.5 py-2 transition-colors ${
              selected === template.id
                ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/[0.08]'
                : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
            }`}
          >
            <div className="text-sm">{template.icon}</div>
            <div className="text-[10px] text-white/70 leading-tight mt-0.5">{template.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TogglePills<T extends string>({
  options,
  labels,
  active,
  onToggle,
}: {
  options: T[];
  labels: Record<T, string>;
  active: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isActive = active.includes(option);
        return (
          <button
            key={option}
            onClick={() => onToggle(option)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              isActive ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300/80' : 'border-white/10 text-white/40 hover:text-white/65'
            }`}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * What this specialist can already do, and what's still missing — never a
 * technical dump, just plain-language per capability. Only ever shows
 * capabilities OnyxLink actually offers: intellectual work (always, once
 * active) and execution actions backed by one of the 5 real integrations.
 * A capability that needs a connector OnyxLink doesn't implement
 * (`not_available` — Gmail, an ERP...) never reaches this list at all; it's
 * internal metadata, not something to show or count.
 */
function CapabilityBreakdown({
  intellectual,
  offeredExecution,
}: {
  intellectual: CapabilityReadiness[];
  offeredExecution: CapabilityReadiness[];
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-3 space-y-2.5">
      {intellectual.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Ya puede ayudarte con</div>
          <ul className="space-y-0.5">
            {intellectual.map((c) => (
              <li key={c.capabilityId} className="text-[11px] text-emerald-300/75">
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {offeredExecution.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Acciones que ejecuta</div>
          <ul className="space-y-1">
            {offeredExecution.map((c) => (
              <li key={c.capabilityId} className="text-[11px] flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-white/70">{c.label}</span>
                <span className={CAPABILITY_STATUS_TW[c.status]}>
                  {c.status === 'missing_connection'
                    ? `Falta conectar: ${c.missingIntegrations.map((id) => REAL_INTEGRATION_LABELS[id]).join(', ')}`
                    : CAPABILITY_STATUS_LABEL_ES[c.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SpecialistCard({
  seatLabel,
  draft,
  realIntegrations,
  openRouterStatus,
  onChange,
  onReset,
}: {
  seatLabel: string;
  draft: SpecialistDraft;
  realIntegrations: RealIntegrationStatusMap;
  openRouterStatus: OpenRouterStatus;
  onChange: (patch: Partial<SpecialistDraft>) => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showCompiled, setShowCompiled] = useState(false);
  const template = (draft.templateId ? findSpecialistTemplate(draft.templateId) : null) ?? null;
  const openRouterConnected = OPENROUTER_STATUS_ACTIVATES[openRouterStatus];
  const installedExtensions: SpecialistExtension[] = draft.extensions
    .map((id) => SPECIALIST_EXTENSIONS.find((extension) => extension.id === id))
    .filter((extension): extension is SpecialistExtension => Boolean(extension));
  const summary = resolveSpecialistWorkSummary(template, draft, openRouterConnected, realIntegrations, installedExtensions);

  const toggleAction = (action: OfficeSpecialistAction) => {
    const has = draft.allowedActions.includes(action);
    onChange({ allowedActions: has ? draft.allowedActions.filter((a) => a !== action) : [...draft.allowedActions, action] });
  };
  const toggleExtension = (id: (typeof SPECIALIST_EXTENSIONS)[number]['id']) => {
    const has = draft.extensions.includes(id);
    onChange({ extensions: has ? draft.extensions.filter((e) => e !== id) : [...draft.extensions, id] });
  };
  const toggleSkill = (id: (typeof SPECIALIST_SKILLS)[number]['id']) => {
    const has = draft.skills.includes(id);
    onChange({ skills: has ? draft.skills.filter((s) => s !== id) : [...draft.skills, id] });
  };

  const applyTemplate = (id: SpecialistTemplateId) => {
    const picked = findSpecialistTemplate(id);
    if (!picked) return;
    onChange({
      templateId: id,
      name: picked.name,
      function: picked.function,
      objective: picked.objective,
      instructions: picked.instructions,
      allowedActions: [...picked.allowedActions],
      approvalPolicy: picked.approvalPolicy,
    });
  };

  const compiled = compileEffectiveSpecialistPrompt({
    identity: `${draft.name} — ${draft.function}`,
    baseInstructions: draft.instructions,
    verticalOverlay: null,
    clientLayer: draft.clientLayer,
    safetyNotes: template?.safetyNotes ?? [],
  });

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3 border-l-2" style={{ borderLeftColor: draft.color }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A0DCDB]/60">{seatLabel}</div>
          <div className="text-sm text-white/85 font-medium mt-0.5">{draft.name}</div>
          <div className="text-[11px] text-white/35">{template ? template.label : 'Sin plantilla — puesto sin preparar'}</div>
          {template && <p className="text-[11px] text-white/45 mt-1 max-w-md leading-snug">{template.summary}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            role="switch"
            aria-checked={draft.enabled}
            aria-label="Activar puesto"
            disabled={!draft.enabled && !openRouterConnected}
            title={!draft.enabled && !openRouterConnected ? openRouterAttentionMessage(openRouterStatus) : undefined}
            onClick={() => onChange({ enabled: !draft.enabled })}
            className={`relative w-10 h-6 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              draft.enabled ? 'bg-emerald-500/80 border-emerald-400/40' : 'bg-white/[0.06] border-white/10'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${draft.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <button onClick={() => setExpanded((v) => !v)} className="onyx-control text-[11px] font-medium text-white/70 px-2.5 py-1.5 transition-colors">
            {expanded ? 'Cerrar' : 'Configurar'}
          </button>
        </div>
      </div>

      {template && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SPECIALIST_WORK_STATUS_TW[summary.status]}`}>
            {SPECIALIST_WORK_STATUS_LABEL_ES[summary.status]}
          </span>
          {summary.connectedTotal > 0 && (
            <span className="text-[10px] text-white/35">
              Funciones conectadas: {summary.connectedCount} de {summary.connectedTotal}
            </span>
          )}
        </div>
      )}

      {summary.status === 'needs_attention' && summary.attentionReason && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-200/85 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span>{!openRouterConnected ? openRouterAttentionMessage(openRouterStatus) : summary.attentionReason}</span>
          {!openRouterConnected && (
            <a
              href="/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-100 underline underline-offset-2 hover:text-white"
              title="Se abre en una pestaña nueva — tus cambios aquí no se pierden."
            >
              Ir a Ajustes → Integraciones (pestaña nueva)
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-3 pt-1 border-t border-white/[0.06]">
          <TemplatePicker selected={draft.templateId} onSelect={applyTemplate} />

          {template && (summary.intellectualCapabilities.length > 0 || summary.offeredExecutionCapabilities.length > 0) && (
            <CapabilityBreakdown intellectual={summary.intellectualCapabilities} offeredExecution={summary.offeredExecutionCapabilities} />
          )}

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wide text-white/30">Nombre visible</label>
              <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30 block mb-1">Color</label>
              <input
                type="color"
                value={draft.color}
                onChange={(e) => onChange({ color: e.target.value })}
                title="Color del personaje en la escena 3D"
                className="w-9 h-9 rounded-md border border-white/10 bg-transparent cursor-pointer p-0.5"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Función</label>
            <input value={draft.function} onChange={(e) => onChange({ function: e.target.value })} className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Objetivo</label>
            <textarea value={draft.objective} onChange={(e) => onChange({ objective: e.target.value })} rows={2} className="onyx-input w-full rounded-md px-3 py-2 text-xs leading-relaxed mt-1 resize-y" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1 block">Modelo de IA</label>
            <ModelPicker
              value={draft.model}
              onChange={(id) => onChange({ model: id })}
              emptyHint="Usa el modelo principal del workspace (Orquestador → Modelos de especialistas) si no eliges uno propio aquí."
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Cómo debe trabajar para esta empresa</label>
            <p className="text-[10px] text-white/25 mb-1">Añade tono, prioridades y reglas propias. Este contenido se conserva aunque cambies la plantilla.</p>
            <textarea value={draft.clientLayer} onChange={(e) => onChange({ clientLayer: e.target.value })} rows={3} className="onyx-input w-full rounded-md px-3 py-2 text-xs leading-relaxed resize-y" />
          </div>

          <details className="group rounded-lg border border-white/[0.07] bg-black/15 p-3">
            <summary className="cursor-pointer list-none text-[11px] font-semibold text-[#BFE7E6]/80 flex items-center justify-between">
              Ajustes técnicos avanzados
              <span className="text-white/30 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <p className="mt-1 text-[10px] text-white/30">Solo necesitas abrir esta sección para cambiar el prompt base, permisos, ampliaciones o aprobaciones.</p>
            <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-white/30">Prompt base de la plantilla</label>
                <textarea value={draft.instructions} onChange={(e) => onChange({ instructions: e.target.value })} rows={6} className="onyx-input w-full rounded-md px-3 py-2 text-xs leading-relaxed mt-1 resize-y" />
              </div>

              <button onClick={() => setShowCompiled((v) => !v)} className="text-[11px] text-[#A0DCDB]/70 hover:text-[#BFE7E6] text-left w-fit">
                {showCompiled ? 'Ocultar prompt final' : 'Comprobar prompt final'}
              </button>
              {showCompiled && (
                <pre className="text-[10px] text-white/50 bg-black/20 rounded-md p-3 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">{compiled.compiledText}</pre>
              )}

              <div>
                <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Ampliaciones</label>
                <TogglePills options={SPECIALIST_EXTENSIONS.map((e) => e.id)} labels={Object.fromEntries(SPECIALIST_EXTENSIONS.map((e) => [e.id, `${e.icon} ${e.name}`])) as Record<string, string>} active={draft.extensions} onToggle={toggleExtension} />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Habilidades internas</label>
                <TogglePills options={SPECIALIST_SKILLS.map((s) => s.id)} labels={Object.fromEntries(SPECIALIST_SKILLS.map((s) => [s.id, `${s.icon} ${s.name}`])) as Record<string, string>} active={draft.skills} onToggle={toggleSkill} />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Acciones permitidas</label>
                <TogglePills options={ALL_ACTIONS} labels={SPECIALIST_ACTION_LABEL_ES} active={draft.allowedActions} onToggle={toggleAction} />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Aprobación humana</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_APPROVAL_POLICIES.map((policy) => (
                    <button
                      key={policy}
                      onClick={() => onChange({ approvalPolicy: policy })}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        draft.approvalPolicy === policy ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/40 hover:text-white/65'
                      }`}
                    >
                      {APPROVAL_POLICY_LABEL_ES[policy]}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={onReset} className="onyx-control text-[11px] font-medium text-white/60 px-2.5 py-1.5 transition-colors w-fit">
                Restablecer puesto
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function SectorPicker({ sectorId, preview, onPreview, onApply, onClear }: {
  sectorId: VerticalId | null;
  preview: ReturnType<OfficeConfigurator['previewVertical']>;
  onPreview: (id: VerticalId) => void;
  onApply: (id: VerticalId) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-[10px] uppercase tracking-wide text-white/30">Sector</label>
        {sectorId && (
          <button onClick={onClear} className="text-[11px] text-white/40 hover:text-rose-300">
            Quitar sector
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {SPECIALIST_VERTICALS.map((vertical) => (
          <button
            key={vertical.id}
            onClick={() => onPreview(vertical.id)}
            title={vertical.summary}
            className={`text-left rounded-md border px-2.5 py-2 transition-colors ${
              sectorId === vertical.id ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
            }`}
          >
            <div className="text-sm">{vertical.icon}</div>
            <div className="text-[10px] text-white/70 leading-tight mt-0.5">{vertical.name}</div>
          </button>
        ))}
      </div>

      {preview && (
        <div className="rounded-md border border-dashed border-white/10 bg-white/[0.015] p-3 mt-3">
          <div className="text-[11px] text-white/60 mb-1.5">
            Al aplicar <strong>{preview.vertical.name}</strong> se proponen trabajadores en los puestos vacíos. Nada se activa ni se publica automáticamente.
          </div>
          <ul className="space-y-1 mb-2">
            {preview.proposedChanges.filter((c) => c.willInstallTemplate).map((change) => (
              <li key={change.agentId} className="text-[11px] text-emerald-300/70">
                + {findSpecialistTemplate(change.templateId)?.label} en {change.agentId}
              </li>
            ))}
            {preview.proposedChanges.filter((c) => !c.willInstallTemplate).length > 0 && (
              <li className="text-[11px] text-white/40">
                {preview.proposedChanges.filter((c) => !c.willInstallTemplate).length} puesto(s) ya instalado(s) recibirán una guía de sector.
              </li>
            )}
          </ul>
          {preview.conflicts.length > 0 && (
            <ul className="space-y-1 mb-2">
              {preview.conflicts.map((conflict) => (
                <li key={conflict.agentId} className="text-[11px] text-amber-300/70">{conflict.reason}</li>
              ))}
            </ul>
          )}
          <button onClick={() => onApply(preview.vertical.id)} className="onyx-control text-[11px] font-medium text-white/80 px-3 py-1.5 transition-colors">
            Aplicar {preview.vertical.name}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConfiguradorView(props: Props) {
  const {
    demoMode = false,
    loading,
    loadError,
    saving,
    presetVersion,
    status,
    revision,
    updatedAt,
    sectorId,
    officeNameDraft,
    setOfficeNameDraft,
    specialistDrafts,
    realIntegrations,
    openRouterStatus,
    updateSpecialistDraft,
    resetSpecialist,
    lastResult,
    hasUnsavedChanges,
    save,
    publish,
    previewVertical,
    applyVertical,
  } = props;
  // eslint-disable-next-line react-hooks/purity -- relative "last saved/published" display is meant to reflect wall-clock time at render.
  const now = Date.now();
  const [sectorPreview, setSectorPreview] = useState<ReturnType<OfficeConfigurator['previewVertical']>>(null);
  const configuredCount = CONFIGURABLE_AGENT_IDS.filter((id) => specialistDrafts[id].templateId !== null).length;
  const enabledCount = CONFIGURABLE_AGENT_IDS.filter((id) => specialistDrafts[id].enabled).length;
  const nextEmptySeat = CONFIGURABLE_AGENT_IDS.find((id) => specialistDrafts[id].templateId === null) ?? null;

  const addTemplateToNextSeat = (templateId: SpecialistTemplateId) => {
    const template = findSpecialistTemplate(templateId);
    if (!template || !nextEmptySeat) return;
    updateSpecialistDraft(nextEmptySeat, {
      templateId,
      name: template.name,
      function: template.function,
      objective: template.objective,
      instructions: template.instructions,
      allowedActions: [...template.allowedActions],
      approvalPolicy: template.approvalPolicy,
    });
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <ViewHeader
        icon={SlidersHorizontal}
        eyebrow={demoMode ? 'Oficina Virtual · Demostración interactiva' : 'Oficina Virtual · Solo superadministración'}
        title="Configurador"
        description={demoMode
          ? 'Prueba plantillas, especialistas y publicaciones sin conectar servicios reales. Los cambios se reinician al recargar.'
          : 'Personalización real para esta empresa. Se guarda en el servidor y persiste al recargar.'}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-[#A0DCDB]/70 border-[#8AD3D2]/25 bg-[#83CFCE]/[0.05]">
              {STANDARD_OFFICE_PRESET.displayName} · v{presetVersion}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${CONFIGURATION_STATUS_TW[status]}`}>{CONFIGURATION_STATUS_LABEL_ES[status]}</span>
            <span className="text-[10px] text-white/28">Revisión {revision} · {relativeTime(updatedAt, now)}</span>
          </div>
        }
        guide={demoMode ? {
          title: 'Entorno de demostración',
          items: [
            'Puedes editar, activar y publicar para recorrer el flujo completo.',
            'Nada se guarda en la empresa ni se envía a integraciones externas.',
            'Al recargar, la configuración de muestra vuelve a su estado inicial.',
          ],
        } : {
          title: 'Configuración protegida',
          items: [
            'Los cambios afectan únicamente a la empresa indicada en esta cabecera.',
            'WhatsApp y Voz mantienen sus prompts en el panel y en Vapi; aquí no se duplican.',
            'Aplicar un sector propone trabajadores en puestos vacíos, sin activarlos ni publicarlos.',
          ],
        }}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">
        <div className="w-full max-w-5xl space-y-4 pb-4">
          {loading && <p className="text-[11px] text-white/40">Cargando la configuración real de esta empresa...</p>}
          {loadError && (
            <div className="rounded-md border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-200/85">
              No se pudo cargar la configuración: {loadError}
            </div>
          )}

          <section className="onyx-config-launchpad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white/90"><WandSparkles size={16} className="text-[#A0DCDB]" /> Puesta en marcha rápida</div>
                <p className="mt-1 text-[11px] text-white/40">Elige el sector, añade los perfiles que necesites y publica. Los detalles técnicos quedan disponibles dentro de cada puesto.</p>
              </div>
              <div className="flex gap-2 text-[10px]">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/50">{configuredCount}/8 preparados</span>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1 text-emerald-200/70">{enabledCount} activos</span>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                ['1', 'Elige el sector', sectorId ? 'Sector aplicado' : 'Usa las opciones de abajo'],
                ['2', 'Prepara el equipo', configuredCount > 0 ? `${configuredCount} puestos listos` : 'Añade perfiles recomendados'],
                ['3', 'Activa y publica', enabledCount > 0 ? `${enabledCount} visibles al publicar` : 'Activa solo los necesarios'],
              ].map(([step, title, detail], index) => (
                <div key={step} className="rounded-lg border border-white/[0.06] bg-black/15 p-3 flex gap-2.5">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${index < (sectorId ? 1 : 0) || index < (configuredCount ? 2 : 0) || index < (enabledCount ? 3 : 0) ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-white/35'}`}>
                    {index < (enabledCount ? 3 : configuredCount ? 2 : sectorId ? 1 : 0) ? <CheckCircle2 size={13} /> : step}
                  </span>
                  <div><div className="text-[11px] font-semibold text-white/75">{title}</div><div className="mt-0.5 text-[10px] text-white/30">{detail}</div></div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/35">Añadir perfil al siguiente puesto libre</span>
                {!nextEmptySeat && <span className="text-[10px] text-emerald-300/65">Los 8 puestos están preparados</span>}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {SPECIALIST_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => addTemplateToNextSeat(template.id)}
                    disabled={!nextEmptySeat}
                    title={template.summary}
                    className="shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left hover:border-[#8AD3D2]/25 hover:bg-[#83CFCE]/[0.06] disabled:opacity-35"
                  >
                    <span className="mr-1.5">{template.icon}</span><span className="text-[11px] font-medium text-white/68">{template.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <label className="text-[10px] uppercase tracking-wide text-white/30">Nombre visible de la oficina</label>
            <input value={officeNameDraft} onChange={(e) => setOfficeNameDraft(e.target.value)} className="onyx-input w-full max-w-sm rounded-md px-3 py-2 text-xs mt-1" />
          </div>

          <SectorPicker
            sectorId={sectorId}
            preview={sectorPreview}
            onPreview={(id) => setSectorPreview(previewVertical(id))}
            onApply={(id) => {
              applyVertical(id);
              setSectorPreview(null);
            }}
            onClear={() => {
              applyVertical(null);
              setSectorPreview(null);
            }}
          />

          <details className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
            <summary className="cursor-pointer list-none text-[11px] font-medium text-white/55">Ver puestos conectados desde el SaaS <span className="text-white/25">({PROTECTED_SEATS.length})</span></summary>
            <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-white/[0.05] pt-3">
              {PROTECTED_SEATS.map((seat) => (
                <ProtectedSeatCard key={seat.agentId} displayLabel={seat.displayLabel} />
              ))}
            </div>
          </details>

          <div className="grid sm:grid-cols-2 gap-4">
            {CONFIGURABLE_AGENT_IDS.map((agentId: ConfigurableOfficeAgentId, index) => (
              <SpecialistCard
                key={agentId}
                seatLabel={`Especialista ${index + 1}`}
                draft={specialistDrafts[agentId]}
                realIntegrations={realIntegrations}
                openRouterStatus={openRouterStatus}
                onChange={(patch) => updateSpecialistDraft(agentId, patch)}
                onReset={() => resetSpecialist(agentId)}
              />
            ))}
          </div>

          {lastResult && (
            <div className={`rounded-lg border p-4 text-xs leading-relaxed ${lastResult.status === 'ok' ? 'border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-100/80' : 'border-rose-500/25 bg-rose-500/[0.05] text-rose-100/80'}`}>
              {lastResult.status === 'ok' ? (
                'Cambios guardados para esta empresa.'
              ) : (
                <>
                  <div>{(lastResult.code && CONFIGURATION_ERROR_LABEL_ES[lastResult.code]) ?? lastResult.message}</div>
                  {lastResult.issues && lastResult.issues.length > 0 && (
                    <ul className="mt-1.5 list-disc list-inside space-y-0.5">
                      {lastResult.issues.map((issue, i) => (
                        <li key={i}>{issue.message}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-[#08070a]/95 backdrop-blur px-4 sm:px-6 py-3">
        <div className="w-full max-w-5xl flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
          <span className="text-[11px] text-white/30 mr-auto">
            {hasUnsavedChanges ? (
              <span className="text-amber-300/70">Hay cambios sin guardar.</span>
            ) : (
              'Publicar hace visibles estos cambios en la Oficina Virtual del cliente.'
            )}
          </span>
          <button onClick={save} disabled={saving} className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors disabled:opacity-50">
            Guardar borrador
          </button>
          <button
            onClick={publish}
            disabled={saving}
            title="Publica la Oficina: los especialistas activados pasan a verse en la Oficina Virtual del cliente."
            className="bg-[#79CBCA] hover:bg-[#83CFCE] text-[#102828] rounded-md px-4 py-2 text-xs font-semibold transition-colors border border-[#8AD3D2]/25 disabled:opacity-50"
          >
            Publicar
          </button>
        </div>
      </div>
    </div>
  );
}

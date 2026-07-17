import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { agents as staticOfficeAgents } from '../agents';
import { STANDARD_OFFICE_PRESET, selectOfficeAgentPromptOwnership } from '../central-integrations';
import type { ConfigurableOfficeAgentId, OfficeApprovalPolicy, OfficeSpecialistAction } from '../central-integrations/configuration';
import type { WorkspaceOfficeSeat } from '../central-integrations/preset';
import type { OfficeConfigurator, SpecialistDraft } from '../hooks/useOfficeConfigurator';
import { relativeTime } from '../lib/relativeTime';
import {
  APPROVAL_POLICY_LABEL_ES,
  CONFIGURATION_ERROR_LABEL_ES,
  CONFIGURATION_STATUS_LABEL_ES,
  CONFIGURATION_STATUS_TW,
  SPECIALIST_ACTION_LABEL_ES,
} from '../lib/officeConfiguratorStyles';
import ViewHeader from './ui/ViewHeader';

type Props = OfficeConfigurator;

const ALL_ACTIONS = Object.keys(SPECIALIST_ACTION_LABEL_ES) as OfficeSpecialistAction[];
const ALL_APPROVAL_POLICIES = Object.keys(APPROVAL_POLICY_LABEL_ES) as OfficeApprovalPolicy[];

// Protected seats never get a color picker (fixed puesto), but the preview
// should still show the color the 3D scene already uses for them today.
function protectedSeatColor(agentId: WorkspaceOfficeSeat['agentId']): string {
  return staticOfficeAgents.find((a) => a.id === agentId)?.color ?? '#94a3b8';
}

function ProtectedSeatCard({ seat }: { seat: WorkspaceOfficeSeat }) {
  const ownership = selectOfficeAgentPromptOwnership(seat.agentId);
  const sourceLabel =
    ownership.source === 'whatsapp_panel'
      ? 'Prompt gestionado en el panel de WhatsApp'
      : ownership.source === 'vapi'
        ? 'Prompt gestionado en Vapi'
        : 'Configuración propia de Oficina Virtual';

  return (
    <div
      className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4 flex items-center justify-between gap-3 border-l-2"
      style={{ borderLeftColor: protectedSeatColor(seat.agentId) }}
    >
      <div>
        <div className="text-sm text-white/70">{seat.displayLabel}</div>
        <div className="text-[11px] text-white/30 mt-0.5">{sourceLabel}</div>
      </div>
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-white/40 border-white/10 bg-white/[0.03]">
        Protegido
      </span>
    </div>
  );
}

function SpecialistCard({
  draft,
  color,
  onChange,
  onColorChange,
  onReset,
}: {
  draft: SpecialistDraft;
  color: string;
  onChange: (patch: Partial<SpecialistDraft>) => void;
  onColorChange: (color: string) => void;
  onReset: () => void;
}) {
  const toggleAction = (action: OfficeSpecialistAction) => {
    const has = draft.allowedActions.includes(action);
    onChange({ allowedActions: has ? draft.allowedActions.filter((a) => a !== action) : [...draft.allowedActions, action] });
  };

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3 border-l-2" style={{ borderLeftColor: color }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/60">Especialista configurable</div>
        <button onClick={onReset} className="onyx-control text-[11px] font-medium text-white/60 px-2.5 py-1 transition-colors">
          Restablecer
        </button>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wide text-white/30">Nombre</label>
          <input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-white/30 block mb-1">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            title="Color del personaje en la escena 3D"
            className="w-9 h-9 rounded-md border border-white/10 bg-transparent cursor-pointer p-0.5"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide text-white/30">Función</label>
        <input
          value={draft.function}
          onChange={(e) => onChange({ function: e.target.value })}
          className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide text-white/30">Objetivo</label>
        <textarea
          value={draft.objective}
          onChange={(e) => onChange({ objective: e.target.value })}
          rows={3}
          className="onyx-input w-full min-h-20 max-h-56 rounded-md px-3 py-2 text-xs leading-relaxed mt-1 resize-y"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide text-white/30">Instrucciones</label>
        <textarea
          value={draft.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
          rows={8}
          className="onyx-input w-full min-h-44 max-h-[28rem] rounded-md px-3 py-2 text-xs leading-relaxed mt-1 resize-y"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Acciones permitidas</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_ACTIONS.map((action) => {
            const active = draft.allowedActions.includes(action);
            return (
              <button
                key={action}
                onClick={() => toggleAction(action)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300/80'
                    : 'border-white/10 text-white/40 hover:text-white/65'
                }`}
              >
                {SPECIALIST_ACTION_LABEL_ES[action]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Aprobación humana</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_APPROVAL_POLICIES.map((policy) => (
            <button
              key={policy}
              onClick={() => onChange({ approvalPolicy: policy })}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                draft.approvalPolicy === policy
                  ? 'border-violet-400/40 bg-violet-500/10 text-violet-200'
                  : 'border-white/10 text-white/40 hover:text-white/65'
              }`}
            >
              {APPROVAL_POLICY_LABEL_ES[policy]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ConfiguradorView({
  provisioned,
  protectedSeats,
  state,
  officeNameDraft,
  setOfficeNameDraft,
  specialistDrafts,
  updateSpecialistDraft,
  resetSpecialistDraft,
  specialistColors,
  setSpecialistColor,
  lastResult,
  save,
  publish,
}: Props) {
  const [showPreview, setShowPreview] = useState(false);
  // eslint-disable-next-line react-hooks/purity -- relative "last saved/published" display is meant to reflect wall-clock time at render.
  const now = Date.now();
  const specialistIds = Object.keys(specialistDrafts) as ConfigurableOfficeAgentId[];

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <ViewHeader
        icon={SlidersHorizontal}
        eyebrow="Oficina Virtual · Solo superadministración"
        title="Configurador de plantilla"
        description={`Personalización aislada para ${provisioned.workspaceId}. Todavía sin conexiones reales.`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-violet-300/70 border-violet-400/25 bg-violet-500/[0.05]">
              {STANDARD_OFFICE_PRESET.displayName} · v{provisioned.presetVersion}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${CONFIGURATION_STATUS_TW[state.current.status]}`}>
              {CONFIGURATION_STATUS_LABEL_ES[state.current.status]}
            </span>
            <span className="text-[10px] text-white/28">Revisión {state.current.revision} · {relativeTime(state.current.updatedAt, now)}</span>
          </div>
        }
        guide={{
          title: 'Configuración protegida',
          items: [
            'Los cambios afectan únicamente al workspace indicado en esta cabecera.',
            'WhatsApp y Voz mantienen sus prompts en el panel y en Vapi; aquí no se duplican.',
            'Previsualiza y valida los especialistas antes de publicar una revisión.',
          ],
        }}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">
        <div className="w-full max-w-5xl space-y-4 pb-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <label className="text-[10px] uppercase tracking-wide text-white/30">Nombre visible de la oficina</label>
          <input
            value={officeNameDraft}
            onChange={(e) => setOfficeNameDraft(e.target.value)}
            className="onyx-input w-full max-w-sm rounded-md px-3 py-2 text-xs mt-1"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {protectedSeats.map((seat) => (
            <ProtectedSeatCard key={seat.agentId} seat={seat} />
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {specialistIds.map((agentId) => (
            <SpecialistCard
              key={agentId}
              draft={specialistDrafts[agentId]}
              color={specialistColors[agentId]}
              onChange={(patch) => updateSpecialistDraft(agentId, patch)}
              onColorChange={(color) => setSpecialistColor(agentId, color)}
              onReset={() => resetSpecialistDraft(agentId)}
            />
          ))}
        </div>

        {lastResult && (
          <div
            className={`rounded-lg border p-4 text-xs leading-relaxed ${
              lastResult.success
                ? 'border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-100/80'
                : 'border-rose-500/25 bg-rose-500/[0.05] text-rose-100/80'
            }`}
          >
            {lastResult.success ? (
              'Cambios guardados para este workspace.'
            ) : (
              <>
                <div>{CONFIGURATION_ERROR_LABEL_ES[lastResult.code] ?? 'No se pudo guardar la configuración.'}</div>
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

        {showPreview && (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.015] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30 mb-1">
              Vista previa — así se vería la oficina con estos cambios
            </div>
            <div className="text-sm text-white/85 font-medium mb-3">{officeNameDraft}</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {protectedSeats.map((seat) => (
                <div
                  key={seat.agentId}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 border-l-2"
                  style={{ borderLeftColor: protectedSeatColor(seat.agentId) }}
                >
                  <div className="text-xs text-white/80 font-medium">{seat.displayLabel}</div>
                  <div className="text-[10px] text-white/30 mt-0.5">Puesto fijo</div>
                </div>
              ))}
              {specialistIds.map((agentId) => {
                const d = specialistDrafts[agentId];
                return (
                  <div
                    key={agentId}
                    className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 border-l-2"
                    style={{ borderLeftColor: specialistColors[agentId] }}
                  >
                    <div className="text-xs text-white/90 font-medium truncate">{d.name}</div>
                    <div className="text-[10px] text-white/40 truncate">{d.function}</div>
                    <div className="text-[10px] text-white/25 mt-1">
                      {d.allowedActions.length} acción(es) · {APPROVAL_POLICY_LABEL_ES[d.approvalPolicy]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-[#08070a]/95 backdrop-blur px-4 sm:px-6 py-3">
        <div className="w-full max-w-5xl flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors mr-auto"
          >
            {showPreview ? 'Ocultar vista previa' : 'Vista previa de la configuración'}
          </button>
          <button
            onClick={save}
            className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors"
          >
            Guardar cambios
          </button>
          <button
            onClick={publish}
            className="bg-violet-600 hover:bg-violet-500 text-white rounded-md px-4 py-2 text-xs font-semibold transition-colors border border-violet-400/25"
          >
            Publicar
          </button>
        </div>
      </div>
    </div>
  );
}

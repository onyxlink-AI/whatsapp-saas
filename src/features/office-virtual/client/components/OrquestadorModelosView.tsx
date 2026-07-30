import { useState } from 'react';
import type { AgentId } from '../../schemas';
import type { OpenRouterCostProfile } from '../central-orchestrator';
import type { AgentOverridePatch, ModelPolicyPatch, OrchestratorFeed } from '../hooks/useOrchestratorFeed';
import {
  MODEL_BLOCKER_LABEL_ES,
  OPENROUTER_COST_PROFILE_LABEL_ES,
  OPENROUTER_COST_PROFILE_TW,
  OPENROUTER_EXECUTION_BLOCKER_LABEL_ES,
} from '../lib/orchestratorStyles';
import type { Agent } from '../types';

// Presentational only, built against Codex's real central-orchestrator
// (OpenRouterConfig.agentOverrides + selectOpenRouterModelForAgent) via
// useOrchestratorFeed.ts — no reducer or fixtures live here. Nothing on this
// screen makes a real OpenRouter call, streams a real response, computes a
// real cost, or asks for an API key: `costProfile` is a label the admin
// picks (economy/balanced/premium), not a measured number, and the "blocked"
// notes below are derived locally from `resolveModelForAgent`, never from a
// live check against OpenRouter.

type Props = { feed: OrchestratorFeed; agents: Agent[] };

// Same five seats Skills already treats as eligible (WhatsApp/Voice keep
// their own prompts and connections — see COORDINACION_CLAUDE_CODEX.md).
const MODEL_SEAT_IDS: AgentId[] = ['coordinator', 'proposal', 'operations', 'content', 'review-qa'];
const COST_PROFILES: OpenRouterCostProfile[] = ['economy', 'balanced', 'premium'];

function CostProfilePills({
  value,
  onSelect,
}: {
  value: OpenRouterCostProfile;
  onSelect: (profile: OpenRouterCostProfile) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COST_PROFILES.map((profile) => (
        <button
          key={profile}
          onClick={() => onSelect(profile)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
            value === profile ? OPENROUTER_COST_PROFILE_TW[profile] : 'border-white/10 text-white/40 hover:text-white/65'
          }`}
        >
          {OPENROUTER_COST_PROFILE_LABEL_ES[profile]}
        </button>
      ))}
    </div>
  );
}

function LimitField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-white/30">{label}</label>
      <input
        type="number"
        min={1}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.trim() === '' ? null : Math.max(1, Math.round(Number(e.target.value))))}
        placeholder="Sin límite"
        className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
      />
    </div>
  );
}

function WorkspacePolicyPanel({ feed }: { feed: OrchestratorFeed }) {
  const policy = feed.binding.openrouter;
  const [draft, setDraft] = useState<Required<ModelPolicyPatch>>({
    model: policy.model,
    fallbackModel: policy.fallbackModel,
    costProfile: policy.costProfile,
    dailyRequestLimit: policy.dailyRequestLimit,
    monthlyRequestLimit: policy.monthlyRequestLimit,
    allowPremiumModels: policy.allowPremiumModels,
  });

  const dirty =
    draft.model !== policy.model ||
    draft.fallbackModel !== policy.fallbackModel ||
    draft.costProfile !== policy.costProfile ||
    draft.dailyRequestLimit !== policy.dailyRequestLimit ||
    draft.monthlyRequestLimit !== policy.monthlyRequestLimit ||
    draft.allowPremiumModels !== policy.allowPremiumModels;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-1">Modelo principal del workspace</div>
      <p className="text-[11px] text-white/35 mb-3 leading-relaxed">
        Se usa en cualquier puesto que no tenga su propio override abajo. No hay campo de API key aquí — eso lo gestiona el backend en la
        pestaña Conexión.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-white/30">Modelo principal</label>
          <input
            value={draft.model ?? ''}
            onChange={(e) => setDraft({ ...draft, model: e.target.value.trim() || null })}
            placeholder="p. ej. anthropic/claude-sonnet-4.5"
            className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-white/30">Modelo alternativo (si el principal falla)</label>
          <input
            value={draft.fallbackModel ?? ''}
            onChange={(e) => setDraft({ ...draft, fallbackModel: e.target.value.trim() || null })}
            placeholder="p. ej. openai/gpt-4.1-mini"
            className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5">Perfil de coste</div>
        <CostProfilePills value={draft.costProfile} onSelect={(costProfile) => setDraft({ ...draft, costProfile })} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <LimitField label="Límite diario de solicitudes" value={draft.dailyRequestLimit} onChange={(v) => setDraft({ ...draft, dailyRequestLimit: v })} />
        <LimitField label="Límite mensual de solicitudes" value={draft.monthlyRequestLimit} onChange={(v) => setDraft({ ...draft, monthlyRequestLimit: v })} />
      </div>

      <label className="flex items-center gap-2 mt-3 text-[11px] text-white/50">
        <input
          type="checkbox"
          checked={draft.allowPremiumModels}
          onChange={(e) => setDraft({ ...draft, allowPremiumModels: e.target.checked })}
        />
        Permitir modelos de perfil &ldquo;Premium&rdquo; en este workspace
      </label>

      <div className="flex items-center justify-between mt-3 gap-2">
        {!policy.hasApiKey && <span className="text-[11px] text-white/30">Sin API key en backend — esta política queda lista para cuando exista.</span>}
        <button
          onClick={() => feed.updateOpenRouterModelPolicy(draft)}
          disabled={!dirty}
          className="ml-auto shrink-0 bg-[#79CBCA] hover:bg-[#83CFCE] text-[#102828] rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors border border-[#8AD3D2]/25 disabled:opacity-40 disabled:pointer-events-none"
        >
          Guardar política
        </button>
      </div>
    </div>
  );
}

function ExecutionStatusRow({ agent, feed }: { agent: Agent; feed: OrchestratorFeed }) {
  const seatRole = agent.seat.role;

  if (seatRole === 'whatsapp' || seatRole === 'voice') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-black/20 px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs text-white/80 font-medium">{agent.name}</div>
          <div className="text-[10px] text-white/30">
            {seatRole === 'whatsapp' ? 'Conexión propia de WhatsApp (YCloud)' : 'Conexión propia de Voz (Vapi)'}
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/10 text-white/40 bg-white/[0.03]">
          No usa esta política
        </span>
      </div>
    );
  }

  const execution = feed.resolveExecutionForAgent(agent.id);
  const resolved = execution.model;
  const ready = execution.ready;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-black/20 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-white/80 font-medium">{agent.name}</div>
        <div className="text-[10px] text-white/30 truncate">{resolved.model ?? 'sin modelo asignado'}</div>
        {!ready && (
          <div className="text-[10px] text-amber-300/70 mt-0.5">
            {execution.blockers.map((b) => OPENROUTER_EXECUTION_BLOCKER_LABEL_ES[b]).join(' · ')}
          </div>
        )}
      </div>
      <span
        className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          ready ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300/80' : 'border-amber-500/25 bg-amber-500/[0.06] text-amber-300/80'
        }`}
      >
        {ready ? 'Listo para ejecutar' : 'Bloqueado'}
      </span>
    </div>
  );
}

function ExecutionStatusPanel({ agents, feed }: { agents: Agent[]; feed: OrchestratorFeed }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-1">Estado de ejecución</div>
      <p className="text-[11px] text-white/35 mb-3 leading-relaxed">
        Qué modelo usaría hoy cada uno de los siete puestos si el Coordinador lo invocara, resuelto con la misma lógica que las filas de
        abajo. WhatsApp y Voz no pasan por esta política — mantienen su propia conexión. Nada de esto llama a OpenRouter, transmite en
        streaming ni calcula un coste real.
      </p>
      <div className="space-y-1.5">
        {agents.map((agent) => (
          <ExecutionStatusRow key={agent.id} agent={agent} feed={feed} />
        ))}
      </div>
    </div>
  );
}

function SeatOverrideRow({ agent, feed }: { agent: Agent; feed: OrchestratorFeed }) {
  const [expanded, setExpanded] = useState(false);
  const resolved = feed.resolveModelForAgent(agent.id);
  const existingOverride = feed.binding.openrouter.agentOverrides[agent.id] ?? null;
  const hasOverride = resolved.source === 'agent_override';

  const [draft, setDraft] = useState<Required<AgentOverridePatch>>({
    model: existingOverride?.model ?? null,
    fallbackModel: existingOverride?.fallbackModel ?? null,
    costProfile: existingOverride?.costProfile ?? resolved.costProfile,
    dailyRequestLimit: existingOverride?.dailyRequestLimit ?? null,
    monthlyRequestLimit: existingOverride?.monthlyRequestLimit ?? null,
    allowPremiumModels: existingOverride?.allowPremiumModels ?? null,
  });

  return (
    <div className="rounded-md border border-white/[0.05] bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-white/85 font-medium">{agent.name}</span>
            <span className="text-[10px] text-white/35">{agent.role}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                hasOverride ? 'border-[#8AD3D2]/30 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/40 bg-white/[0.03]'
              }`}
            >
              {hasOverride ? 'Override propio' : 'Usa el modelo principal'}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${OPENROUTER_COST_PROFILE_TW[resolved.costProfile]}`}>
              {OPENROUTER_COST_PROFILE_LABEL_ES[resolved.costProfile]}
            </span>
            <span className="text-[10px] text-white/30">{resolved.model ?? 'sin modelo asignado'}</span>
          </div>
          {resolved.blockers.length > 0 && (
            <p className="text-[10px] text-amber-300/70 mt-1">{resolved.blockers.map((b) => MODEL_BLOCKER_LABEL_ES[b]).join(' · ')}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasOverride && (
            <button
              onClick={() => feed.updateAgentModelOverride(agent.id, null)}
              className="text-[11px] font-medium text-white/45 hover:text-rose-300 px-2 py-1.5 transition-colors"
            >
              Quitar override
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="onyx-control text-[11px] font-medium text-white/80 px-2.5 py-1.5 transition-colors"
          >
            {expanded ? 'Cerrar' : 'Personalizar'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Modelo propio de {agent.name}</label>
              <input
                value={draft.model ?? ''}
                onChange={(e) => setDraft({ ...draft, model: e.target.value.trim() || null })}
                placeholder={feed.binding.openrouter.model ?? 'Modelo principal'}
                className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Alternativo propio</label>
              <input
                value={draft.fallbackModel ?? ''}
                onChange={(e) => setDraft({ ...draft, fallbackModel: e.target.value.trim() || null })}
                placeholder={feed.binding.openrouter.fallbackModel ?? 'Alternativo principal'}
                className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
              />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5">Perfil de coste propio</div>
            <CostProfilePills value={draft.costProfile ?? resolved.costProfile} onSelect={(costProfile) => setDraft({ ...draft, costProfile })} />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-white/50">
            <input
              type="checkbox"
              checked={draft.allowPremiumModels ?? feed.binding.openrouter.allowPremiumModels}
              onChange={(e) => setDraft({ ...draft, allowPremiumModels: e.target.checked })}
            />
            Permitir modelos &ldquo;Premium&rdquo; para este puesto
          </label>
          <div className="flex justify-end">
            <button
              onClick={() => {
                feed.updateAgentModelOverride(agent.id, draft);
                setExpanded(false);
              }}
              className="onyx-control text-[11px] font-medium text-white/80 px-3 py-1.5 transition-colors"
            >
              Guardar override
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrquestadorModelosView({ feed, agents }: Props) {
  const seats = MODEL_SEAT_IDS.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => Boolean(a));

  return (
    <div className="space-y-4">
      <ExecutionStatusPanel agents={agents} feed={feed} />

      <WorkspacePolicyPanel feed={feed} />

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-1">Modelos por puesto</div>
        <p className="text-[11px] text-white/35 mb-3 leading-relaxed">
          El Orquestador y los cuatro especialistas pueden usar el modelo principal o su propio override. WhatsApp y Voz no aparecen aquí:
          conservan su prompt y su conexión en sus propios paneles.
        </p>
        <div className="space-y-2">
          {seats.map((agent) => (
            <SeatOverrideRow key={agent.id} agent={agent} feed={feed} />
          ))}
        </div>
      </div>
    </div>
  );
}

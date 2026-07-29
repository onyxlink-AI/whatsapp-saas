import { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Sparkles } from 'lucide-react';
import type {
  Skill,
  SkillApprovalPolicy,
  SkillDefinition,
  SkillMetrics,
  SkillOrigin,
  SkillProposal,
  SkillSimulationRun,
  SkillSimulationStatus,
  SkillsFeed,
  SkillStatus,
  SkillTriggerType,
} from '../hooks/useSkillsFeed';
import { relativeTime } from '../lib/relativeTime';
import {
  SKILL_APPROVAL_POLICY_LABEL_ES,
  SKILL_ORIGIN_LABEL_ES,
  SKILL_ORIGIN_TW,
  SKILL_SIMULATION_STATUS_LABEL_ES,
  SKILL_SIMULATION_STATUS_TW,
  SKILL_STATUS_LABEL_ES,
  SKILL_STATUS_TW,
  SKILL_TRIGGER_TYPE_LABEL_ES,
  formatSkillCost,
  formatSkillDuration,
} from '../lib/skillStyles';
import ViewHeader from './ui/ViewHeader';

// Presentational only — consumes Codex's real src/central-skills +
// src/hooks/useSkillsFeed.ts (SkillsFeed) as-is. No reducer, fixtures or
// provisional hook live here, and central-skills/useSkillsFeed are untouched.
// Eligibility is entirely feed-driven: this view never hardcodes an AgentId
// to decide who can receive a skill — `eligibleAssignees` already reflects
// Codex's structural exclusion of WhatsApp/Voice (SKILL_ELIGIBLE_AGENT_IDS),
// we just render whatever it contains. See COORDINACION_CLAUDE_CODEX.md.

type Props = { feed: SkillsFeed; isSuperAdmin: boolean };

type WorkshopTab = 'editor' | 'simulator' | 'metrics' | 'history';
type MobileZone = 'catalogo' | 'taller' | 'asignacion';
type SkillAction = 'test' | 'approve' | 'publish' | 'pause' | 'improve' | 'reject';

// Display-only guidance for which buttons make sense to show per status.
// Codex's central-skills is the source of truth for whether a transition is
// actually valid (mandatory administrative approval included) — if a call is
// rejected, `feed.error` explains why. This never blocks a call from firing,
// it only decides what's worth showing.
const ACTIONS_BY_STATUS: Record<SkillStatus, SkillAction[]> = {
  draft: ['test', 'improve', 'reject'],
  testing: ['test', 'approve', 'improve', 'reject'],
  pending_approval: ['approve', 'reject'],
  approved: ['publish', 'improve', 'reject'],
  published: ['pause', 'improve'],
  paused: ['publish', 'improve'],
  rejected: ['improve'],
};

const ACTION_LABEL: Record<SkillAction, string> = {
  test: 'Probar',
  approve: 'Aprobar',
  publish: 'Publicar',
  pause: 'Pausar',
  improve: 'Mejorar',
  reject: 'Rechazar',
};

function emptyDefinition(): SkillDefinition {
  return {
    objective: '',
    triggers: [],
    inputs: [],
    steps: [],
    tools: [],
    outputs: [],
    approval: { policy: 'sensitive_only', note: '' },
  };
}

function cloneDefinition(definition: SkillDefinition): SkillDefinition {
  return JSON.parse(JSON.stringify(definition)) as SkillDefinition;
}

/* --------------------------------- badges -------------------------------- */

function StatusBadge({ status }: { status: SkillStatus }) {
  return (
    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${SKILL_STATUS_TW[status]}`}>
      {SKILL_STATUS_LABEL_ES[status]}
    </span>
  );
}

function OriginBadge({ origin }: { origin: SkillOrigin }) {
  return (
    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${SKILL_ORIGIN_TW[origin]}`}>
      {SKILL_ORIGIN_LABEL_ES[origin]}
    </span>
  );
}

/* -------------------------------- catálogo -------------------------------- */

function ProposalCard({
  proposal,
  onCreate,
  onDismiss,
}: {
  proposal: SkillProposal;
  onCreate: () => void;
  onDismiss: () => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- "detected X ago" display is meant to reflect wall-clock time at render.
  const now = Date.now();
  return (
    <div className="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-3 flex flex-col gap-2">
      <div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-violet-300/70 mb-0.5">
          Propuesta · {proposal.detectedFromTaskCount} tarea(s) repetidas
        </div>
        <div className="text-sm text-white/90">{proposal.suggestedName}</div>
        <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">{proposal.reason}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onCreate}
          className="flex-1 bg-violet-600 hover:bg-violet-500 text-white rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors border border-violet-400/25"
        >
          Crear skill
        </button>
        <button
          onClick={onDismiss}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-white/10 text-white/45 hover:text-white/75 transition-colors"
        >
          Descartar
        </button>
      </div>
      <div className="text-[10px] text-white/25">hace {relativeTime(proposal.proposedAt, now).replace('hace ', '')}</div>
    </div>
  );
}

function SkillListItem({ skill, active, onSelect }: { skill: Skill; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 flex flex-col gap-1.5 transition-colors ${
        active ? 'border-violet-400/40 bg-violet-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-white/90 truncate">{skill.name}</span>
        <StatusBadge status={skill.status} />
      </div>
      <p className="text-[11px] text-white/40 line-clamp-2">{skill.description || 'Sin descripción todavía.'}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <OriginBadge origin={skill.origin} />
        <span className="text-[10px] text-white/30">{skill.metrics.successRate}% éxito</span>
        <span className="text-[10px] text-white/30">·</span>
        <span className="text-[10px] text-white/30">{skill.assignments.length} asignada(s)</span>
      </div>
    </button>
  );
}

function CatalogZone({
  feed,
  selectedSkillId,
  onSelectSkill,
}: {
  feed: SkillsFeed;
  selectedSkillId: string | null;
  onSelectSkill: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<SkillOrigin | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.skills.filter((s) => {
      if (originFilter !== 'all' && s.origin !== originFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [feed.skills, originFilter, query]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
        <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-1">Taller de Skills</div>
        <div className="flex items-center gap-2">
          <h2 className="text-white font-semibold text-sm">Biblioteca</h2>
          <span className="text-[10px] text-white/30">{feed.skills.length} skill(s)</span>
          <button
            onClick={() => setCreating((value) => !value)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/20"
          >
            <Plus size={13} /> Crear skill
          </button>
        </div>
        {creating && (
          <div className="mt-2.5 rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-2.5">
            <label className="text-[10px] text-white/50">Nombre de la nueva habilidad</label>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={newSkillName}
                onChange={(event) => setNewSkillName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const id = feed.createBlankSkill(newSkillName);
                  if (id) { onSelectSkill(id); setNewSkillName(''); setCreating(false); }
                }}
                placeholder="Ej: Revisar un presupuesto"
                className="onyx-input min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-xs"
                autoFocus
              />
              <button
                onClick={() => {
                  const id = feed.createBlankSkill(newSkillName);
                  if (id) { onSelectSkill(id); setNewSkillName(''); setCreating(false); }
                }}
                disabled={!newSkillName.trim()}
                className="rounded-md bg-violet-600 px-2.5 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                Crear
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-white/32">Crearemos una estructura segura para que solo tengas que completar el objetivo y ajustar sus pasos.</p>
          </div>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar skills..."
          className="onyx-input w-full rounded-md px-3 py-1.5 text-xs mt-2.5"
        />
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {(['all', 'installed', 'candidate'] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOriginFilter(o)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                originFilter === o ? 'border-violet-400/40 bg-violet-500/10 text-violet-200' : 'border-white/10 text-white/45 hover:text-white/70'
              }`}
            >
              {o === 'all' ? 'Todas' : SKILL_ORIGIN_LABEL_ES[o]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {feed.proposals.length > 0 && (
          <div className="px-4 pt-3 pb-1 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Propuestas ({feed.proposals.length})
            </div>
            {feed.proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onCreate={() => {
                  const id = feed.createSkillFromProposal(p.id);
                  if (id) onSelectSkill(id);
                }}
                onDismiss={() => feed.dismissProposal(p.id)}
              />
            ))}
          </div>
        )}

        <div className="px-4 py-3 space-y-2">
          {feed.loading ? (
            [0, 1, 2].map((i) => <div key={i} className="h-20 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />)
          ) : filtered.length === 0 ? (
            <div className="text-xs text-white/30 text-center mt-8">
              {feed.skills.length === 0 ? 'Todavía no hay skills en este workspace.' : 'Ninguna skill coincide con la búsqueda.'}
            </div>
          ) : (
            filtered.map((skill) => (
              <SkillListItem key={skill.id} skill={skill} active={skill.id === selectedSkillId} onSelect={() => onSelectSkill(skill.id)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- editor --------------------------------- */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1 block">{children}</label>;
}

function RemovableRow({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5 flex items-start gap-2">
      <div className="flex-1 min-w-0 space-y-1.5">{children}</div>
      <button onClick={onRemove} className="shrink-0 text-white/30 hover:text-rose-400 transition-colors px-1" aria-label="Eliminar" title="Eliminar">
        ✕
      </button>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-dashed border-white/15 text-white/45 hover:text-white/75 hover:border-white/30 transition-colors"
    >
      {label}
    </button>
  );
}

const TRIGGER_TYPES: SkillTriggerType[] = ['keyword', 'event', 'schedule', 'manual'];
const APPROVAL_POLICIES: SkillApprovalPolicy[] = ['always', 'sensitive_only', 'never'];

function EditorTab({ draft, onChange }: { draft: SkillDefinition; onChange: (next: SkillDefinition) => void }) {
  const patch = (p: Partial<SkillDefinition>) => onChange({ ...draft, ...p });

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Objetivo</FieldLabel>
        <textarea
          value={draft.objective}
          onChange={(e) => patch({ objective: e.target.value })}
          rows={3}
          placeholder="¿Qué logra esta skill y por qué existe?"
          className="onyx-input w-full rounded-md px-3 py-2 text-xs leading-relaxed resize-y"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <FieldLabel>Disparadores</FieldLabel>
        </div>
        <div className="space-y-1.5">
          {draft.triggers.map((t) => (
            <RemovableRow key={t.id} onRemove={() => patch({ triggers: draft.triggers.filter((x) => x.id !== t.id) })}>
              <div className="flex gap-1.5">
                <select
                  value={t.type}
                  onChange={(e) =>
                    patch({ triggers: draft.triggers.map((x) => (x.id === t.id ? { ...x, type: e.target.value as SkillTriggerType } : x)) })
                  }
                  className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
                >
                  {TRIGGER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SKILL_TRIGGER_TYPE_LABEL_ES[type]}
                    </option>
                  ))}
                </select>
                <input
                  value={t.description}
                  onChange={(e) =>
                    patch({ triggers: draft.triggers.map((x) => (x.id === t.id ? { ...x, description: e.target.value } : x)) })
                  }
                  placeholder="Descripción del disparador"
                  className="onyx-input flex-1 rounded-md px-2.5 py-1.5 text-[11px]"
                />
              </div>
            </RemovableRow>
          ))}
          <AddButton
            label="+ Añadir disparador"
            onClick={() => patch({ triggers: [...draft.triggers, { id: crypto.randomUUID(), type: 'manual', description: '' }] })}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Entradas</FieldLabel>
        <div className="space-y-1.5">
          {draft.inputs.map((inp) => (
            <RemovableRow key={inp.id} onRemove={() => patch({ inputs: draft.inputs.filter((x) => x.id !== inp.id) })}>
              <div className="flex gap-1.5">
                <input
                  value={inp.name}
                  onChange={(e) => patch({ inputs: draft.inputs.map((x) => (x.id === inp.id ? { ...x, name: e.target.value } : x)) })}
                  placeholder="Nombre"
                  className="onyx-input flex-1 rounded-md px-2.5 py-1.5 text-[11px]"
                />
                <label className="flex items-center gap-1 text-[10px] text-white/40 whitespace-nowrap px-1">
                  <input
                    type="checkbox"
                    checked={inp.required}
                    onChange={(e) => patch({ inputs: draft.inputs.map((x) => (x.id === inp.id ? { ...x, required: e.target.checked } : x)) })}
                  />
                  Obligatoria
                </label>
              </div>
              <input
                value={inp.description}
                onChange={(e) => patch({ inputs: draft.inputs.map((x) => (x.id === inp.id ? { ...x, description: e.target.value } : x)) })}
                placeholder="Descripción"
                className="onyx-input w-full rounded-md px-2.5 py-1.5 text-[11px]"
              />
            </RemovableRow>
          ))}
          <AddButton
            label="+ Añadir entrada"
            onClick={() => patch({ inputs: [...draft.inputs, { id: crypto.randomUUID(), name: '', description: '', required: false }] })}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Herramientas</FieldLabel>
        <div className="space-y-1.5">
          {draft.tools.map((tool) => (
            <RemovableRow key={tool.id} onRemove={() => patch({ tools: draft.tools.filter((x) => x.id !== tool.id) })}>
              <div className="flex gap-1.5">
                <input
                  value={tool.name}
                  onChange={(e) => patch({ tools: draft.tools.map((x) => (x.id === tool.id ? { ...x, name: e.target.value } : x)) })}
                  placeholder="Nombre de la herramienta"
                  className="onyx-input flex-1 rounded-md px-2.5 py-1.5 text-[11px]"
                />
                <label className="flex items-center gap-1 text-[10px] text-white/40 whitespace-nowrap px-1">
                  <input
                    type="checkbox"
                    checked={tool.allowed}
                    onChange={(e) => patch({ tools: draft.tools.map((x) => (x.id === tool.id ? { ...x, allowed: e.target.checked } : x)) })}
                  />
                  Permitida
                </label>
              </div>
              <input
                value={tool.description}
                onChange={(e) => patch({ tools: draft.tools.map((x) => (x.id === tool.id ? { ...x, description: e.target.value } : x)) })}
                placeholder="Para qué se usa"
                className="onyx-input w-full rounded-md px-2.5 py-1.5 text-[11px]"
              />
            </RemovableRow>
          ))}
          <AddButton
            label="+ Añadir herramienta"
            onClick={() => patch({ tools: [...draft.tools, { id: crypto.randomUUID(), name: '', description: '', allowed: true }] })}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Pasos</FieldLabel>
        <div className="space-y-1.5">
          {[...draft.steps]
            .sort((a, b) => a.order - b.order)
            .map((step, i, sorted) => (
              <RemovableRow key={step.id} onRemove={() => patch({ steps: draft.steps.filter((x) => x.id !== step.id) })}>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[10px] text-white/30 w-4">{i + 1}.</span>
                  <input
                    value={step.title}
                    onChange={(e) => patch({ steps: draft.steps.map((x) => (x.id === step.id ? { ...x, title: e.target.value } : x)) })}
                    placeholder="Título del paso"
                    className="onyx-input flex-1 rounded-md px-2.5 py-1.5 text-[11px]"
                  />
                  <select
                    value={step.toolId ?? ''}
                    onChange={(e) =>
                      patch({ steps: draft.steps.map((x) => (x.id === step.id ? { ...x, toolId: e.target.value || null } : x)) })
                    }
                    className="onyx-input rounded-md px-1.5 py-1.5 text-[10px] max-w-[110px]"
                  >
                    <option value="">Sin herramienta</option>
                    {draft.tools.map((tool) => (
                      <option key={tool.id} value={tool.id}>
                        {tool.name || 'Sin nombre'}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-col shrink-0">
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        const prev = sorted[i - 1];
                        patch({
                          steps: draft.steps.map((x) => {
                            if (x.id === step.id) return { ...x, order: prev.order };
                            if (x.id === prev.id) return { ...x, order: step.order };
                            return x;
                          }),
                        });
                      }}
                      className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:pointer-events-none leading-none px-1"
                      aria-label="Subir paso"
                    >
                      ▲
                    </button>
                    <button
                      disabled={i === sorted.length - 1}
                      onClick={() => {
                        const next = sorted[i + 1];
                        patch({
                          steps: draft.steps.map((x) => {
                            if (x.id === step.id) return { ...x, order: next.order };
                            if (x.id === next.id) return { ...x, order: step.order };
                            return x;
                          }),
                        });
                      }}
                      className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:pointer-events-none leading-none px-1"
                      aria-label="Bajar paso"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <input
                  value={step.description}
                  onChange={(e) => patch({ steps: draft.steps.map((x) => (x.id === step.id ? { ...x, description: e.target.value } : x)) })}
                  placeholder="Qué hace este paso"
                  className="onyx-input w-full rounded-md px-2.5 py-1.5 text-[11px]"
                />
              </RemovableRow>
            ))}
          <AddButton
            label="+ Añadir paso"
            onClick={() =>
              patch({
                steps: [
                  ...draft.steps,
                  { id: crypto.randomUUID(), order: draft.steps.length + 1, title: '', description: '', toolId: null },
                ],
              })
            }
          />
        </div>
      </div>

      <div>
        <FieldLabel>Resultados</FieldLabel>
        <div className="space-y-1.5">
          {draft.outputs.map((out) => (
            <RemovableRow key={out.id} onRemove={() => patch({ outputs: draft.outputs.filter((x) => x.id !== out.id) })}>
              <input
                value={out.name}
                onChange={(e) => patch({ outputs: draft.outputs.map((x) => (x.id === out.id ? { ...x, name: e.target.value } : x)) })}
                placeholder="Nombre del resultado"
                className="onyx-input w-full rounded-md px-2.5 py-1.5 text-[11px]"
              />
              <input
                value={out.description}
                onChange={(e) => patch({ outputs: draft.outputs.map((x) => (x.id === out.id ? { ...x, description: e.target.value } : x)) })}
                placeholder="Descripción"
                className="onyx-input w-full rounded-md px-2.5 py-1.5 text-[11px]"
              />
            </RemovableRow>
          ))}
          <AddButton
            label="+ Añadir resultado"
            onClick={() => patch({ outputs: [...draft.outputs, { id: crypto.randomUUID(), name: '', description: '' }] })}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Aprobación</FieldLabel>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {APPROVAL_POLICIES.map((policy) => (
            <button
              key={policy}
              onClick={() => patch({ approval: { ...draft.approval, policy } })}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                draft.approval.policy === policy
                  ? 'border-violet-400/40 bg-violet-500/10 text-violet-200'
                  : 'border-white/10 text-white/40 hover:text-white/65'
              }`}
            >
              {SKILL_APPROVAL_POLICY_LABEL_ES[policy]}
            </button>
          ))}
        </div>
        <input
          value={draft.approval.note}
          onChange={(e) => patch({ approval: { ...draft.approval, note: e.target.value } })}
          placeholder="Nota para quien apruebe (opcional)"
          className="onyx-input w-full rounded-md px-3 py-2 text-xs"
        />
      </div>
    </div>
  );
}

/* ------------------------------- simulador -------------------------------- */

function TraceDot({ status }: { status: SkillSimulationStatus }) {
  return (
    <span
      className={`absolute -left-5 top-1 w-3.5 h-3.5 rounded-full border-2 ${
        status === 'success'
          ? 'bg-emerald-400 border-emerald-300'
          : status === 'error'
            ? 'bg-rose-500 border-rose-300'
            : status === 'running'
              ? 'bg-amber-400 border-amber-300 animate-pulse'
              : 'bg-transparent border-white/25'
      }`}
    />
  );
}

function TraceCard({
  title,
  status,
  output,
  durationMs,
}: {
  title: string;
  status: SkillSimulationStatus;
  output: string | null;
  durationMs: number | null;
}) {
  return (
    <div className="relative">
      <TraceDot status={status} />
      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-white/85">{title}</span>
          <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${SKILL_SIMULATION_STATUS_TW[status]}`}>
            {SKILL_SIMULATION_STATUS_LABEL_ES[status]}
          </span>
        </div>
        {output && <p className="text-[11px] text-white/45 mt-1 leading-relaxed">{output}</p>}
        {durationMs != null && <p className="text-[10px] text-white/25 mt-1">{formatSkillDuration(durationMs)}</p>}
      </div>
    </div>
  );
}

function SimulatorTab({ skill, run, onTest }: { skill: Skill; run: SkillSimulationRun | undefined; onTest: () => void }) {
  const steps = [...skill.definition.steps].sort((a, b) => a.order - b.order);
  // The run's steps are meant to line up with the skill's own step ids, but
  // fall back to showing the run's own trace when nothing lines up (e.g. a
  // run recorded against an older/different step layout) — an all-"Pendiente"
  // trace next to a run that actually finished would be misleading.
  const matchedAny = run ? run.steps.some((s) => steps.some((step) => step.id === s.stepId)) : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40 max-w-sm">Ejecuta esta skill en un entorno de prueba y sigue el trazado paso a paso.</p>
        <button
          onClick={onTest}
          className="shrink-0 bg-violet-600 hover:bg-violet-500 text-white rounded-md px-3 py-1.5 text-xs font-semibold transition-colors border border-violet-400/25"
        >
          Ejecutar prueba
        </button>
      </div>

      {!run ? (
        <div className="text-xs text-white/30 text-center py-8">Todavía no se ha ejecutado ninguna prueba para esta skill.</div>
      ) : steps.length === 0 || !matchedAny ? (
        run.steps.length === 0 ? (
          <div className="text-xs text-white/30 text-center py-8">La última prueba no registró pasos.</div>
        ) : (
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
            <div className="space-y-3">
              {run.steps.map((result, i) => (
                <TraceCard
                  key={result.stepId}
                  title={`${i + 1}. ${result.output ?? 'Paso de la última prueba'}`}
                  status={result.status}
                  output={null}
                  durationMs={result.durationMs}
                />
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
          <div className="space-y-3">
            {steps.map((step, i) => {
              const result = run.steps.find((s) => s.stepId === step.id);
              return (
                <TraceCard
                  key={step.id}
                  title={`${i + 1}. ${step.title || 'Paso sin título'}`}
                  status={result?.status ?? 'pending'}
                  output={result?.output ?? null}
                  durationMs={result?.durationMs ?? null}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- métricas --------------------------------- */

function MetricsTab({ metrics }: { metrics: SkillMetrics }) {
  const items = [
    { label: 'Tasa de éxito', value: `${metrics.successRate}%` },
    { label: 'Coste medio', value: formatSkillCost(metrics.avgCostUsd) },
    { label: 'Duración media', value: formatSkillDuration(metrics.avgDurationMs) },
    { label: 'Tiempo ahorrado', value: `${metrics.estimatedMinutesSaved.toLocaleString('es')} min` },
    { label: 'Ejecuciones', value: String(metrics.runsCount) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="text-[10px] text-white/30 uppercase tracking-wide mb-1">{item.label}</div>
          <div className="text-lg text-white/90 font-semibold">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- historial --------------------------------- */

function HistoryTab({ skill, onRestore }: { skill: Skill; onRestore: (versionId: string) => void }) {
  // eslint-disable-next-line react-hooks/purity -- version age display is meant to reflect wall-clock time at render.
  const now = Date.now();
  const sorted = [...skill.versions].sort((a, b) => b.version - a.version);
  const latestId = sorted[0]?.id;

  if (sorted.length === 0) return <div className="text-xs text-white/30 text-center py-8">Sin versiones todavía.</div>;

  return (
    <ul className="space-y-2">
      {sorted.map((v) => (
        <li key={v.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/85 font-medium">v{v.version}</div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {relativeTime(v.createdAt, now)} · {v.createdBy}
            </div>
            {v.changeNote && <p className="text-[11px] text-white/35 mt-1 leading-relaxed">{v.changeNote}</p>}
          </div>
          {v.id !== latestId && (
            <button
              onClick={() => onRestore(v.id)}
              className="shrink-0 onyx-control text-[11px] font-medium text-white/75 px-2.5 py-1 transition-colors"
            >
              Restaurar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------- taller ---------------------------------- */

const WORKSHOP_TABS: { id: WorkshopTab; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'simulator', label: 'Simulador' },
  { id: 'metrics', label: 'Métricas' },
  { id: 'history', label: 'Historial' },
];

function WorkshopZone({ feed, skill }: { feed: SkillsFeed; skill: Skill | null }) {
  const [tab, setTab] = useState<WorkshopTab>('editor');
  const [draft, setDraft] = useState<SkillDefinition>(() => (skill ? cloneDefinition(skill.definition) : emptyDefinition()));
  // Compared against a local snapshot of what was last saved/loaded, not
  // against `skill.definition` directly: Codex's adapter round-trips the
  // definition through central-skills' plain-string shape and regenerates
  // fresh ids for every trigger/input/step/tool on the way back
  // (`${skillId}-trigger-${index}`, etc.), so a deep-equality check against
  // the feed's own copy would never match again after the first edit even
  // though the save succeeded.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(draft));
  const [pendingAction, setPendingAction] = useState<'improve' | 'reject' | null>(null);
  const [pendingNote, setPendingNote] = useState('');

  if (!skill) {
    return (
      <div className="h-full flex items-center justify-center text-center px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-2">Taller de Skills</div>
          <p className="text-sm text-white/30 max-w-xs">
            Selecciona una skill de la biblioteca o crea una nueva para abrir el taller.
          </p>
        </div>
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== savedSnapshot;
  const availableActions = ACTIONS_BY_STATUS[skill.status];
  const run = feed.simulationRuns[skill.id];

  const fireAction = (action: SkillAction) => {
    if (action === 'improve' || action === 'reject') {
      setPendingAction(action);
      setPendingNote('');
      return;
    }
    if (action === 'test') feed.testSkill(skill.id);
    if (action === 'approve') feed.approveSkill(skill.id);
    if (action === 'publish') feed.publishSkill(skill.id);
    if (action === 'pause') feed.pauseSkill(skill.id);
  };

  const confirmPendingAction = () => {
    if (pendingAction === 'improve') feed.improveSkill(skill.id, pendingNote);
    if (pendingAction === 'reject') feed.rejectSkill(skill.id, pendingNote);
    setPendingAction(null);
    setPendingNote('');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
        <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-1">Taller de Skills</div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-white font-semibold text-base leading-snug truncate">{skill.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <StatusBadge status={skill.status} />
          <OriginBadge origin={skill.origin} />
          <span className="text-[10px] text-white/30">v{skill.versions[0]?.version ?? 1}</span>
        </div>
        {skill.rejectionReason && skill.status === 'rejected' && (
          <p className="text-[11px] text-rose-300/75 mt-2">Motivo del rechazo: {skill.rejectionReason}</p>
        )}
        {feed.error && <p className="text-[11px] text-rose-300/75 mt-2">{feed.error}</p>}

        <div className="flex flex-wrap gap-1.5 mt-3">
          {(Object.keys(ACTION_LABEL) as SkillAction[]).map((action) => (
            <button
              key={action}
              disabled={!availableActions.includes(action)}
              onClick={() => fireAction(action)}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-25 disabled:pointer-events-none ${
                action === 'reject'
                  ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85 hover:bg-rose-500/[0.14]'
                  : action === 'publish' || action === 'approve'
                    ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300/85 hover:bg-emerald-500/[0.14]'
                    : 'onyx-control text-white/75'
              }`}
            >
              {ACTION_LABEL[action]}
            </button>
          ))}
        </div>

        {pendingAction && (
          <div className="mt-2.5 rounded-md border border-white/10 bg-white/[0.03] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1.5">
              {pendingAction === 'improve' ? 'Nota de mejora' : 'Motivo del rechazo'}
            </div>
            <textarea
              value={pendingNote}
              onChange={(e) => setPendingNote(e.target.value)}
              rows={2}
              autoFocus
              className="onyx-input w-full rounded-md px-2.5 py-1.5 text-[11px] resize-none"
              placeholder={pendingAction === 'improve' ? '¿Qué debería mejorar esta skill?' : '¿Por qué se rechaza?'}
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                onClick={confirmPendingAction}
                disabled={!pendingNote.trim()}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-500 text-white border border-violet-400/25 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Confirmar
              </button>
              <button
                onClick={() => setPendingAction(null)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-white/10 text-white/50 hover:text-white/80 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 mt-3 border-b border-white/[0.06] -mb-3 pb-0">
          {WORKSHOP_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[11px] font-medium px-3 py-2 border-b-2 transition-colors ${
                tab === t.id ? 'border-violet-400 text-white' : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-5 py-4">
        {tab === 'editor' && <EditorTab draft={draft} onChange={setDraft} />}
        {tab === 'simulator' && <SimulatorTab skill={skill} run={run} onTest={() => feed.testSkill(skill.id)} />}
        {tab === 'metrics' && <MetricsTab metrics={skill.metrics} />}
        {tab === 'history' && <HistoryTab skill={skill} onRestore={(versionId) => feed.restoreVersion(skill.id, versionId)} />}
      </div>

      {tab === 'editor' && (
        <div className="shrink-0 border-t border-white/[0.06] px-4 sm:px-5 py-3 flex items-center justify-end gap-2">
          {dirty && <span className="text-[10px] text-amber-300/70 mr-auto">Cambios sin guardar</span>}
          <button
            onClick={() => {
              feed.saveDraft(skill.id, draft);
              setSavedSnapshot(JSON.stringify(draft));
            }}
            disabled={!dirty}
            className="bg-violet-600 hover:bg-violet-500 text-white rounded-md px-4 py-2 text-xs font-semibold transition-colors border border-violet-400/25 disabled:opacity-40 disabled:pointer-events-none"
          >
            Guardar cambios
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- asignación --------------------------------- */

function AssignmentZone({ feed }: { feed: SkillsFeed }) {
  const assignable = feed.skills.filter((s) => s.status === 'approved' || s.status === 'published');

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
        <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-1">Taller de Skills</div>
        <h2 className="text-white font-semibold text-sm">Asignación</h2>
        <p className="text-[11px] text-white/35 mt-0.5">Mapa de capacidades: qué skill puede usar cada puesto.</p>
      </div>

      <div className="flex-1 overflow-auto min-h-0 px-4 py-3">
        {feed.eligibleAssignees.length === 0 ? (
          <div className="text-xs text-white/30 text-center mt-8">Todavía no hay puestos elegibles para recibir skills.</div>
        ) : assignable.length === 0 ? (
          <div className="text-xs text-white/30 text-center mt-8">Aún no hay skills aprobadas o publicadas para asignar.</div>
        ) : (
          <table className="min-w-full text-[11px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 bg-[#0b0910] text-left px-2 py-1.5 text-white/40 font-medium">Puesto</th>
                {assignable.map((s) => (
                  <th key={s.id} className="sticky top-0 z-0 bg-[#0b0910] px-2 py-1.5 text-white/40 font-medium whitespace-nowrap text-left">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feed.eligibleAssignees.map((assignee) => (
                <tr key={assignee.agentId} className="border-t border-white/[0.05]">
                  <td className="sticky left-0 bg-[#0b0910] px-2 py-2 align-top">
                    <div className="text-white/85 whitespace-nowrap">{assignee.name}</div>
                    <div className="text-[10px] text-white/30 whitespace-nowrap">{assignee.role}</div>
                    {assignee.isOrchestrator && (
                      <span className="inline-block mt-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-violet-400/25 bg-violet-500/[0.06] text-violet-300/70">
                        Orquestador
                      </span>
                    )}
                  </td>
                  {assignable.map((skill) => {
                    const assigned = skill.assignments.some((a) => a.agentId === assignee.agentId);
                    return (
                      <td key={skill.id} className="px-2 py-2 text-center">
                        <button
                          onClick={() =>
                            assigned ? feed.unassignSkill(skill.id, assignee.agentId) : feed.assignSkill(skill.id, assignee.agentId)
                          }
                          aria-label={assigned ? `Quitar ${skill.name} de ${assignee.name}` : `Asignar ${skill.name} a ${assignee.name}`}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
                            assigned
                              ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
                              : 'border-white/10 text-transparent hover:border-white/25 hover:bg-white/[0.04]'
                          }`}
                        >
                          ✓
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- root ----------------------------------- */

function ClientSkillsView({ feed }: { feed: SkillsFeed }) {
  const available = feed.skills.filter((skill) => skill.status === 'published' || skill.status === 'approved');

  return (
    <div className="h-full flex flex-col min-h-0">
      <ViewHeader
        icon={Sparkles}
        eyebrow="Tu equipo digital"
        title="Habilidades disponibles"
        description="Consulta qué trabajos adicionales puede realizar tu equipo. La parte técnica está gestionada por OnyxLink."
        meta={<span className="text-[10px] text-white/35">{available.length} disponibles</span>}
        guide={{
          title: 'Qué significa una habilidad',
          items: [
            'Es una forma de trabajo preparada y revisada para repetir una tarea con calidad.',
            'Solo aparecen aquí las habilidades aprobadas para tu empresa.',
            'Tu equipo de OnyxLink se encarga de probarlas, actualizarlas y mantenerlas seguras.',
          ],
        }}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {available.length === 0 ? (
          <div className="onyx-empty-team">
            <div className="onyx-empty-team__icon"><Sparkles size={22} /></div>
            <h2>Todavía no hay habilidades adicionales</h2>
            <p>Tu equipo puede seguir trabajando con sus funciones habituales. Cuando OnyxLink prepare una nueva habilidad, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 max-w-5xl">
            {available.map((skill) => (
              <article key={skill.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300">
                    <CheckCircle2 size={17} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-white/90">{skill.name}</h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/43">{skill.description || 'Habilidad preparada para tu equipo.'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-[10px] text-white/38">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1 text-emerald-200/75">Lista para usar</span>
                  <span>{skill.assignments.length > 0 ? `${skill.assignments.length} miembros pueden usarla` : 'Pendiente de asignar'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminSkillsView({ feed }: { feed: SkillsFeed }) {
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [mobileZone, setMobileZone] = useState<MobileZone>('catalogo');

  const selectedSkill = feed.skills.find((s) => s.id === selectedSkillId) ?? null;

  const selectSkill = (id: string) => {
    setSelectedSkillId(id);
    setMobileZone('taller');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <ViewHeader
        icon={Sparkles}
        title="Skills"
        description="Diseña, prueba, aprueba y asigna capacidades reutilizables a los especialistas de la oficina."
        meta={<span className="text-[10px] text-white/35">{feed.skills.length} skills</span>}
        guide={{
          title: 'Ciclo recomendado',
          items: [
            'Define entrada, pasos, herramientas, salida y política de aprobación.',
            'Simula la versión actual antes de aprobarla y publicarla.',
            'WhatsApp y Voz quedan excluidos: sus prompts y capacidades se gestionan en sus plataformas.',
          ],
        }}
      />
      <div className="lg:hidden flex items-center gap-1 px-4 pt-3 pb-2 border-b border-white/[0.06] shrink-0 overflow-x-auto">
        {(
          [
            ['catalogo', 'Catálogo'],
            ['taller', 'Taller'],
            ['asignacion', 'Asignación'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMobileZone(id)}
            className={`shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-md border transition-colors ${
              mobileZone === id ? 'border-violet-400/40 bg-violet-500/10 text-violet-200' : 'border-white/10 text-white/45'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <div className={`${mobileZone === 'catalogo' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 w-full lg:w-[300px] lg:shrink-0 lg:border-r lg:border-white/[0.06]`}>
          <CatalogZone feed={feed} selectedSkillId={selectedSkillId} onSelectSkill={selectSkill} />
        </div>

        <div className={`${mobileZone === 'taller' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 flex-1`}>
          {/* Keyed by skill id so switching skills remounts the workshop —
              draft/tab/pending-action reset for free, no effect needed. */}
          <WorkshopZone key={selectedSkill?.id ?? 'empty'} feed={feed} skill={selectedSkill} />
        </div>

        <div className={`${mobileZone === 'asignacion' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 w-full lg:w-[320px] lg:shrink-0 lg:border-l lg:border-white/[0.06]`}>
          <AssignmentZone feed={feed} />
        </div>
      </div>
    </div>
  );
}

export default function SkillsView({ feed, isSuperAdmin }: Props) {
  return isSuperAdmin ? <AdminSkillsView feed={feed} /> : <ClientSkillsView feed={feed} />;
}

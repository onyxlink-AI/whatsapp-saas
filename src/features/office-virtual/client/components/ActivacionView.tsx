import type {
  OfficeActivationDecision,
  OfficeActivationDecisionCode,
  OfficeProvisioningReadiness,
  WorkspaceCapabilitySnapshot,
} from '../central-integrations/types';
import { Power } from 'lucide-react';
import type { WorkspaceWhatsAppBinding } from '../central-integrations/whatsapp-binding';
import { INTEGRATION_HEALTH_LABEL_ES, INTEGRATION_HEALTH_TW, WHATSAPP_AGENT_TYPE_LABEL_ES } from '../lib/integrationHealthStyles';
import { ACTIVATION_STATE_BADGE_TW, ACTIVATION_STATE_LABEL_ES } from '../lib/officeActivationStyles';
import { relativeTime } from '../lib/relativeTime';
import { WHATSAPP_BINDING_STATE_LABEL_ES, WHATSAPP_BINDING_STATE_TW } from '../lib/whatsappBindingStyles';
import ViewHeader from './ui/ViewHeader';

type Props = {
  /** True while the initial real snapshot is being fetched from the backend. */
  loading: boolean;
  /** Transport/backend failure loading or persisting real state. */
  loadError: string | null;
  snapshot: WorkspaceCapabilitySnapshot;
  readiness: OfficeProvisioningReadiness;
  whatsappBinding: WorkspaceWhatsAppBinding;
  lastDecision: OfficeActivationDecision | null;
  onActivate: () => void;
  onDeactivate: () => void;
  /** Display name of the agent staffing the WhatsApp seat (lead-intake), e.g. "Sofía". */
  whatsappAgentName: string;
};

const STATE_HELPER_ES: Record<OfficeProvisioningReadiness['state'], string> = {
  not_ready: 'Completa los requisitos pendientes para poder activarla.',
  ready_to_enable:
    'Todos los requisitos están listos. Actívala cuando quieras habilitar el add-on para este workspace.',
  active: 'La oficina está activa y visible para los administradores autorizados del workspace.',
  misconfigured: 'El flag está activado pero falta un requisito. El acceso sigue bloqueado hasta resolverlo.',
};

const REJECTION_LABEL_ES: Record<Exclude<OfficeActivationDecisionCode, 'approved'>, string> = {
  already_in_state: 'La oficina ya estaba en ese estado.',
  unauthorized: 'Solo superadministración puede activar o desactivar la oficina.',
  workspace_mismatch: 'La solicitud no corresponde a este workspace.',
  stale_state: 'El estado cambió mientras se procesaba la solicitud. Vuelve a intentarlo.',
  prerequisites_not_met: 'Faltan requisitos técnicos para poder activarla.',
};

export default function ActivacionView({
  loading,
  loadError,
  snapshot,
  readiness,
  whatsappBinding,
  lastDecision,
  onActivate,
  onDeactivate,
  whatsappAgentName,
}: Props) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps are meant to reflect wall-clock time at render.
  const now = Date.now();
  const switchOn = snapshot.virtualOfficeEnabled;

  const blockingLabels = readiness.requirements
    .filter((req) => readiness.blockingRequirementIds.includes(req.id))
    .map((req) => req.label);

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={Power}
        eyebrow="Oficina Virtual · Solo superadministración"
        title="Activación"
        description="Controla la disponibilidad de la oficina por workspace. Desactivada, permanece completamente oculta para el cliente."
        guide={{
          title: 'Activación sin errores',
          items: [
            'Confirma que todos los requisitos obligatorios aparecen como listos.',
            'Verifica el workspace seleccionado antes de cambiar el interruptor.',
            'Activa primero en un entorno de prueba y revisa el registro de decisiones.',
          ],
        }}
      />

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 max-w-3xl">
        {loading && (
          <p className="text-[11px] text-white/40">Cargando el estado real del workspace...</p>
        )}
        {loadError && (
          <div className="rounded-md border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-200/85">
            No se pudo cargar o guardar el estado real: {loadError}
          </div>
        )}

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <button
            role="switch"
            aria-checked={switchOn}
            aria-label="Oficina Virtual"
            disabled={loading}
            onClick={() => (switchOn ? onDeactivate() : onActivate())}
            className={`relative shrink-0 w-14 h-8 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${
              switchOn ? 'bg-emerald-500/80 border-emerald-400/40' : 'bg-white/[0.06] border-white/10'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-7 h-7 rounded-full bg-white shadow transition-transform ${
                switchOn ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${ACTIVATION_STATE_BADGE_TW[readiness.state]}`}>
                {ACTIVATION_STATE_LABEL_ES[readiness.state]}
              </span>
              <span className="text-[11px] text-white/35">
                {readiness.requirementsMet}/{readiness.requirementsTotal} requisitos listos
              </span>
            </div>
            <p className="text-xs text-white/45 mt-1.5 leading-relaxed">{STATE_HELPER_ES[readiness.state]}</p>
            {lastDecision &&
              (lastDecision.allowed && lastDecision.auditRecord ? (
                <p className="text-[11px] text-white/30 mt-1.5">
                  {lastDecision.auditRecord.action === 'enable' ? 'Activada' : 'Desactivada'} por{' '}
                  {lastDecision.auditRecord.actorId} · {relativeTime(lastDecision.auditRecord.occurredAt, now)}
                </p>
              ) : (
                <p className="text-[11px] text-rose-300/70 mt-1.5">
                  {REJECTION_LABEL_ES[lastDecision.code as Exclude<OfficeActivationDecisionCode, 'approved'>]}
                </p>
              ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-3">
            Vínculo con WhatsApp
          </div>
          <span
            className={`inline-block text-[11px] font-medium px-2.5 py-1 rounded-full border mb-3 ${WHATSAPP_BINDING_STATE_TW[whatsappBinding.state]}`}
          >
            {WHATSAPP_BINDING_STATE_LABEL_ES[whatsappBinding.state]}
          </span>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Puesto vinculado</div>
              <div className="text-xs text-white/80">{whatsappAgentName} · Agente WhatsApp</div>
            </div>
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Número de WhatsApp</div>
              <div className="text-xs text-white/80">{whatsappBinding.phoneNumberMasked ?? 'No disponible'}</div>
            </div>
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Tipo de agente activo</div>
              <div className="text-xs text-white/80">
                {whatsappBinding.activeAgentType ? WHATSAPP_AGENT_TYPE_LABEL_ES[whatsappBinding.activeAgentType] : 'Sin agente activo'}
              </div>
            </div>
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">YCloud</div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${INTEGRATION_HEALTH_TW[snapshot.ycloud.health]}`}>
                {INTEGRATION_HEALTH_LABEL_ES[snapshot.ycloud.health]}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-3">
            Requisitos técnicos
          </div>
          <ul className="space-y-2">
            {readiness.requirements.map((req) => (
              <li key={req.id} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    req.met ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.06] text-white/35'
                  }`}
                >
                  {req.met ? '✓' : '·'}
                </span>
                <div className="min-w-0">
                  <div className={`text-xs ${req.met ? 'text-white/75' : 'text-white/55'}`}>{req.label}</div>
                  {!req.met && req.reason && <div className="text-[11px] text-white/35 mt-0.5">{req.reason}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {readiness.state === 'misconfigured' && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.05] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300/70 mb-1.5">
              Error de configuración
            </div>
            <p className="text-xs text-rose-100/70 leading-relaxed">
              El add-on está marcado como activo, pero {blockingLabels.length === 1 ? 'este requisito no está' : 'estos requisitos no están'} cumplido{blockingLabels.length === 1 ? '' : 's'}: {blockingLabels.join(', ')}. Ningún administrador del workspace puede acceder hasta desactivar y resolver.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-[11px] text-white/35 flex flex-wrap gap-x-4 gap-y-1">
          <span>Datos capturados {relativeTime(snapshot.capturedAt, now)}</span>
        </div>
      </div>
    </div>
  );
}

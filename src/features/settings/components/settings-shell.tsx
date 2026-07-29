"use client";

import { useSearchParams } from "next/navigation";
import {
  Bot,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardList,
  MessageSquareText,
  Plug,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { BusinessInfoForm } from "./business-info-form";
import { AdvancedMemoryToggle } from "./advanced-memory-toggle";
import { PipelineAiToggle } from "./pipeline-ai-toggle";
import { ColdLeadRecoveryToggle } from "./cold-lead-recovery-toggle";
import { VapiAssistantField } from "./vapi-assistant-field";
import type { VapiConnectionStatus } from "@/features/voice-agent/lib/vapi-status-labels";
import { CrossChannelMemoryToggle } from "./cross-channel-memory-toggle";
import { GestionToggle } from "./gestion-toggle";
import { OfficeVirtualToggle } from "./office-virtual-toggle";
import { ChatbotToggle } from "./chatbot-toggle";
import { ToolsCatalog } from "./tools-catalog";
import { IntegrationsTab } from "./integrations-tab";
import { TeamTab } from "./team-tab";
import { TemplatesTab } from "./templates-tab";
import { AutomationsTab } from "./automations-tab";
import { KbTab } from "./kb-tab";
import { AuditLogTab } from "./audit-log-tab";
import { AgentsTab } from "@/features/agents/components/agents-tab";
import { RemindersTab } from "@/features/reminders/components/reminders-tab";
import type { AgentDto } from "@/features/agents/types";

interface ToolItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sensitivity: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

interface Props {
  workspaceId: string;
  role: string;
  initialBusinessInfo: Record<string, unknown> | null;
  initialTools: ToolItem[];
  initialIntegrations: unknown[];
  initialTemplates?: unknown[];
  initialAgents?: AgentDto[];
  googleServiceAccountEmail?: string;
  initialAdvancedMemoryEnabled?: boolean;
  initialPipelineAiEnabled?: boolean;
  initialColdLeadRecoveryEnabled?: boolean;
  initialVapiAssistantId?: string | null;
  initialVapiStatus?: VapiConnectionStatus;
  initialCrossChannelMemoryEnabled?: boolean;
  /** Only Onyxlink (platform super admin) can toggle the paid add-ons below. */
  isSuperAdmin?: boolean;
  /** false hides every WhatsApp-agent-specific tab/toggle (independent from Gestión). */
  hasWhatsappAgent?: boolean;
  initialGestionEnabled?: boolean;
  initialOfficeVirtualEnabled?: boolean;
  initialChatbotEnabled?: boolean;
}

export function SettingsShell({
  workspaceId,
  initialBusinessInfo,
  initialTools,
  initialIntegrations,
  initialTemplates = [],
  initialAgents = [],
  googleServiceAccountEmail,
  initialAdvancedMemoryEnabled = false,
  initialPipelineAiEnabled = false,
  initialColdLeadRecoveryEnabled = false,
  initialVapiAssistantId = null,
  initialVapiStatus = "not_configured",
  initialCrossChannelMemoryEnabled = false,
  isSuperAdmin = false,
  hasWhatsappAgent = true,
  initialGestionEnabled = false,
  initialOfficeVirtualEnabled = false,
  initialChatbotEnabled = false,
}: Props) {
  const biForForm = initialBusinessInfo as {
    structured: Record<string, unknown>;
    free_text: string | null;
  } | null;

  const isFullMode = hasWhatsappAgent;
  // OnyxLink must be able to build and test an agent before enabling the paid
  // WhatsApp product or connecting YCloud for the client.
  const canConfigureAgents = isFullMode || isSuperAdmin;

  // Lets other screens deep-link here (e.g. "falta esta conexión" hints from
  // Recordatorios y seguimiento point at Ajustes → Integraciones directly).
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const VALID_TABS = new Set([
    "agentes",
    "recordatorios",
    "integraciones",
    "negocio",
    "tools",
    "templates",
    "knowledge-base",
    "equipo",
    "automatizaciones",
    "actividad",
  ]);
  const initialTab =
    requestedTab &&
    VALID_TABS.has(requestedTab) &&
    (requestedTab !== "agentes" || canConfigureAgents)
      ? requestedTab
      : canConfigureAgents
        ? "agentes"
        : "negocio";

  return (
    <div className="page-shell max-w-[88rem] space-y-7">
      <PageHeader
        eyebrow="Configuración"
        title="Ajustes de tu empresa"
        description="Configura tus agentes, conecta herramientas y decide cómo trabaja OnyxLink para tu negocio."
      />

      <Tabs
        defaultValue={initialTab}
        className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-2 lg:sticky lg:top-24 lg:mx-0 lg:overflow-visible lg:p-0">
          <TabsList className="surface-card h-auto w-max justify-start gap-1 bg-card p-2 lg:w-full lg:flex-col lg:items-stretch">
            {canConfigureAgents && (
              <TabsTrigger value="agentes" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Bot className="h-4 w-4" aria-hidden="true" />
                Agentes
              </TabsTrigger>
            )}
            {isFullMode && (
              <TabsTrigger value="recordatorios" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Recordatorios
              </TabsTrigger>
            )}
            {isFullMode && (
              <TabsTrigger value="integraciones" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Plug className="h-4 w-4" aria-hidden="true" />
                Integraciones
              </TabsTrigger>
            )}
            <TabsTrigger value="negocio" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Negocio
            </TabsTrigger>
            {isFullMode && (
              <TabsTrigger value="tools" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Wrench className="h-4 w-4" aria-hidden="true" />
                Herramientas
              </TabsTrigger>
            )}
            {isFullMode && (
              <TabsTrigger value="templates" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                Mensajes
              </TabsTrigger>
            )}
            {isFullMode && (
              <TabsTrigger value="knowledge-base" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Lo que sabe la IA
              </TabsTrigger>
            )}
            <TabsTrigger value="equipo" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Users className="h-4 w-4" aria-hidden="true" />
              Equipo
            </TabsTrigger>
            {isFullMode && (
              <TabsTrigger value="automatizaciones" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Zap className="h-4 w-4" aria-hidden="true" />
                Automatizaciones
              </TabsTrigger>
            )}
            <TabsTrigger value="actividad" className="min-h-11 justify-start gap-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Actividad
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-w-0">
          {canConfigureAgents && (
            <TabsContent value="agentes" className="mt-0">
              <div className="surface-card space-y-6 p-5 sm:p-6">
              <AgentsTab
                workspaceId={workspaceId}
                initialAgents={initialAgents}
              />
              </div>
            </TabsContent>
          )}

          {isFullMode && (
            <TabsContent value="recordatorios" className="mt-0">
              <div className="surface-card space-y-6 p-5 sm:p-6">
              <RemindersTab workspaceId={workspaceId} agents={initialAgents} />
              </div>
            </TabsContent>
          )}

          {isFullMode && (
            <TabsContent value="integraciones" className="mt-0">
              <div className="surface-card space-y-6 p-5 sm:p-6">
              <IntegrationsTab
                workspaceId={workspaceId}
                initialIntegrations={initialIntegrations}
                googleServiceAccountEmail={googleServiceAccountEmail}
              />
              </div>
            </TabsContent>
          )}

          <TabsContent value="negocio" className="mt-0">
            <div className="surface-card space-y-6 p-5 sm:p-6">
            {isSuperAdmin && (
              <OfficeVirtualToggle
                workspaceId={workspaceId}
                initialEnabled={initialOfficeVirtualEnabled}
              />
            )}
            {isSuperAdmin && (
              <ChatbotToggle
                workspaceId={workspaceId}
                initialEnabled={initialChatbotEnabled}
              />
            )}
            <GestionToggle
              workspaceId={workspaceId}
              initialEnabled={initialGestionEnabled}
              isSuperAdmin={isSuperAdmin}
            />
            {isFullMode && (
              <>
                <AdvancedMemoryToggle
                  workspaceId={workspaceId}
                  initialEnabled={initialAdvancedMemoryEnabled}
                  isSuperAdmin={isSuperAdmin}
                />
                <PipelineAiToggle
                  workspaceId={workspaceId}
                  initialEnabled={initialPipelineAiEnabled}
                  isSuperAdmin={isSuperAdmin}
                />
                <ColdLeadRecoveryToggle
                  workspaceId={workspaceId}
                  initialEnabled={initialColdLeadRecoveryEnabled}
                  isSuperAdmin={isSuperAdmin}
                />
                <VapiAssistantField
                  workspaceId={workspaceId}
                  initialAssistantId={initialVapiAssistantId}
                  initialStatus={initialVapiStatus}
                  isSuperAdmin={isSuperAdmin}
                />
                <CrossChannelMemoryToggle
                  workspaceId={workspaceId}
                  initialEnabled={initialCrossChannelMemoryEnabled}
                  isSuperAdmin={isSuperAdmin}
                />
              </>
            )}
            <BusinessInfoForm workspaceId={workspaceId} initial={biForForm} />
            </div>
          </TabsContent>

          {isFullMode && (
            <TabsContent value="tools" className="mt-0">
              <div className="surface-card space-y-6 p-5 sm:p-6">
              <ToolsCatalog
                workspaceId={workspaceId}
                initialTools={initialTools}
              />
              </div>
            </TabsContent>
          )}

          {isFullMode && (
            <TabsContent value="templates" className="mt-0">
              <div className="surface-card p-5 sm:p-6">
              <TemplatesTab
                workspaceId={workspaceId}
                initialTemplates={initialTemplates}
              />
              </div>
            </TabsContent>
          )}
          {isFullMode && (
            <TabsContent value="knowledge-base" className="mt-0">
              <div className="surface-card space-y-6 p-5 sm:p-6">
                <KbTab workspaceId={workspaceId} />
              </div>
            </TabsContent>
          )}

          <TabsContent value="equipo" className="mt-0">
            <div className="surface-card space-y-6 p-5 sm:p-6">
              <TeamTab workspaceId={workspaceId} />
            </div>
          </TabsContent>

          {isFullMode && (
            <TabsContent value="automatizaciones" className="mt-0">
              <div className="surface-card space-y-6 p-5 sm:p-6">
                <AutomationsTab workspaceId={workspaceId} />
              </div>
            </TabsContent>
          )}

          <TabsContent value="actividad" className="mt-0">
            <div className="surface-card space-y-6 p-5 sm:p-6">
              <AuditLogTab workspaceId={workspaceId} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

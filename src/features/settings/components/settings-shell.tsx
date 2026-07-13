"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BusinessInfoForm } from "./business-info-form";
import { AdvancedMemoryToggle } from "./advanced-memory-toggle";
import { PipelineAiToggle } from "./pipeline-ai-toggle";
import { ColdLeadRecoveryToggle } from "./cold-lead-recovery-toggle";
import { VapiAssistantField } from "./vapi-assistant-field";
import { CrossChannelMemoryToggle } from "./cross-channel-memory-toggle";
import { GestionToggle } from "./gestion-toggle";
import { ToolsCatalog } from "./tools-catalog";
import { IntegrationsTab } from "./integrations-tab";
import { TeamTab } from "./team-tab";
import { TemplatesTab } from "./templates-tab";
import { AutomationsTab } from "./automations-tab";
import { KbTab } from "./kb-tab";
import { AuditLogTab } from "./audit-log-tab";
import { AgentsTab } from "@/features/agents/components/agents-tab";
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
  initialCrossChannelMemoryEnabled?: boolean;
  /** Only Onyxlink (platform super admin) can toggle the paid add-ons below. */
  isSuperAdmin?: boolean;
  /** false hides every WhatsApp-agent-specific tab/toggle (independent from Gestión). */
  hasWhatsappAgent?: boolean;
  initialGestionEnabled?: boolean;
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
  initialCrossChannelMemoryEnabled = false,
  isSuperAdmin = false,
  hasWhatsappAgent = true,
  initialGestionEnabled = false,
}: Props) {
  const biForForm = initialBusinessInfo as {
    structured: Record<string, unknown>;
    free_text: string | null;
  } | null;

  const isFullMode = hasWhatsappAgent;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-xl font-semibold text-foreground mb-6">
        Configuración del Workspace
      </h1>

      <Tabs defaultValue={isFullMode ? "agentes" : "negocio"}>
        {/* Scroll the tab strip within its own track instead of letting 11 tabs
            push horizontal overflow onto the whole page. */}
        <div className="mb-6 -mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="glass w-max">
            {isFullMode && <TabsTrigger value="agentes">Agentes</TabsTrigger>}
            {isFullMode && (
              <TabsTrigger value="integraciones">Integraciones</TabsTrigger>
            )}
            <TabsTrigger value="negocio">Negocio</TabsTrigger>
            {isFullMode && <TabsTrigger value="tools">Tools</TabsTrigger>}
            {isFullMode && <TabsTrigger value="templates">Templates</TabsTrigger>}
            {isFullMode && (
              <TabsTrigger value="knowledge-base">Knowledge Base</TabsTrigger>
            )}
            <TabsTrigger value="equipo">Equipo</TabsTrigger>
            {isFullMode && (
              <TabsTrigger value="automatizaciones">Automatizaciones</TabsTrigger>
            )}
            <TabsTrigger value="actividad">Actividad</TabsTrigger>
          </TabsList>
        </div>

        {isFullMode && (
          <TabsContent value="agentes">
            <div className="p-6 space-y-6 rounded-lg glass">
              <AgentsTab
                workspaceId={workspaceId}
                initialAgents={initialAgents}
              />
            </div>
          </TabsContent>
        )}

        {isFullMode && (
          <TabsContent value="integraciones">
            <div className="p-6 space-y-6 rounded-lg glass">
              <IntegrationsTab
                workspaceId={workspaceId}
                initialIntegrations={initialIntegrations}
                googleServiceAccountEmail={googleServiceAccountEmail}
              />
            </div>
          </TabsContent>
        )}

        <TabsContent value="negocio">
          <div className="p-6 space-y-6 rounded-lg glass">
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
          <TabsContent value="tools">
            <div className="p-6 space-y-6 rounded-lg glass">
              <ToolsCatalog
                workspaceId={workspaceId}
                initialTools={initialTools}
              />
            </div>
          </TabsContent>
        )}

        {isFullMode && (
          <TabsContent value="templates">
            <div className="p-6 rounded-lg glass">
              <TemplatesTab
                workspaceId={workspaceId}
                initialTemplates={initialTemplates}
              />
            </div>
          </TabsContent>
        )}
        {isFullMode && (
          <TabsContent value="knowledge-base">
            <div className="p-6 space-y-6 rounded-lg glass">
              <KbTab workspaceId={workspaceId} />
            </div>
          </TabsContent>
        )}

        <TabsContent value="equipo">
          <div className="p-6 space-y-6 rounded-lg glass">
            <TeamTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        {isFullMode && (
          <TabsContent value="automatizaciones">
            <div className="p-6 space-y-6 rounded-lg glass">
              <AutomationsTab workspaceId={workspaceId} />
            </div>
          </TabsContent>
        )}

        <TabsContent value="actividad">
          <div className="p-6 space-y-6 rounded-lg glass">
            <AuditLogTab workspaceId={workspaceId} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

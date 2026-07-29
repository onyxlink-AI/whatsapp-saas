export type WhatsAppOfficeActivationPrerequisites = {
  productEnabled: boolean;
  selectedAgent: boolean;
  ycloudConfigured: boolean;
};

export function getWhatsAppOfficeActivationBlocker(
  prerequisites: WhatsAppOfficeActivationPrerequisites,
): string | null {
  if (!prerequisites.productEnabled) {
    return 'El producto Agente de WhatsApp no está habilitado para esta empresa.';
  }
  if (!prerequisites.selectedAgent) {
    return 'Primero configura y selecciona un agente desde Ajustes → Agentes.';
  }
  if (!prerequisites.ycloudConfigured) {
    return 'Primero conecta YCloud y el número de WhatsApp desde Ajustes → Integraciones.';
  }
  return null;
}

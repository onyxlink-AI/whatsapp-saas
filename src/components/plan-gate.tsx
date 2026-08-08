// Fase 2 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §4.8):
// sustituye el mismo bloque JSX que estaba copiado y pegado en ~9 páginas
// ("Esta sección no está incluida en tu plan..."). Server-renderable, sin
// "use client" — se usa directamente dentro de Server Components de página.
interface PlanGateProps {
  message?: string;
}

const DEFAULT_MESSAGE = "Esta sección no está incluida en tu plan. Pregúntale a tu gestor de Onyxlink.";

export function PlanGate({ message = DEFAULT_MESSAGE }: PlanGateProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
      <p className="text-muted-foreground text-sm max-w-sm">{message}</p>
    </div>
  );
}

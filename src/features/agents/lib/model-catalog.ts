import type { ProviderKey } from "@/features/agents/components/provider-logos";

// ─────────────────────────────────────────────────────────────────────────────
// Curated, friendly model catalog. EDITABLE — add/rename as new models ship.
// `id` is the OpenRouter model id used at runtime. This list was built by
// pulling the live catalog from https://openrouter.ai/api/v1/models and
// filtering to Anthropic, OpenAI, Google Gemini, DeepSeek and Kimi (Moonshot
// AI) — every general-purpose text/chat model each of those five actually
// has on OpenRouter right now (batch-pricing duplicates, image/audio-only
// models and near-duplicate dated snapshots are left out on purpose, since
// they aren't distinct choices for "which brain should my agent use"). VERIFY
// each slug against the live list before relying on it if this goes stale.
// ─────────────────────────────────────────────────────────────────────────────

export type ModelTier = "premium" | "balanced" | "fast";

export interface CatalogModel {
  id: string; // OpenRouter id
  label: string; // friendly name shown to the user
  tier: ModelTier;
  recommendation: string; // "cuándo usar este modelo"
}

export interface CatalogProvider {
  provider: ProviderKey;
  label: string;
  models: CatalogModel[];
}

export const MODEL_CATALOG: CatalogProvider[] = [
  {
    provider: "anthropic",
    label: "Anthropic",
    models: [
      { id: "anthropic/claude-opus-5-fast", label: "Claude Opus 5 (Fast)", tier: "premium", recommendation: "La versión más rápida de Opus 5, sin perder su nivel de razonamiento. Para casos exigentes que además necesitan respuesta ágil." },
      { id: "anthropic/claude-opus-5", label: "Claude Opus 5", tier: "premium", recommendation: "El modelo más potente de Anthropic hasta la fecha. Para razonamiento complejo y conversaciones de máximo valor." },
      { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", tier: "balanced", recommendation: "El equilibrio calidad/costo más reciente de Anthropic. Recomendado por defecto para la mayoría de los agentes." },
      { id: "anthropic/claude-fable-5", label: "Claude Fable 5", tier: "balanced", recommendation: "Variante afinada para conversación natural y creativa, con buen equilibrio de costo." },
      { id: "anthropic/claude-opus-4.8-fast", label: "Claude Opus 4.8 (Fast)", tier: "premium", recommendation: "Opus 4.8 en su variante rápida, mismo nivel de calidad con menor latencia." },
      { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", tier: "premium", recommendation: "Muy potente, una generación por detrás de Opus 5. Buena opción si ya lo tienes probado y funciona bien." },
      { id: "anthropic/claude-opus-4.7-fast", label: "Claude Opus 4.7 (Fast)", tier: "premium", recommendation: "Opus 4.7 rápido — calidad alta con menor latencia." },
      { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", tier: "premium", recommendation: "Generación anterior de Opus, todavía muy capaz." },
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", tier: "balanced", recommendation: "El mejor equilibrio calidad/costo de la generación anterior. Sigue siendo una opción sólida por defecto." },
      { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6", tier: "premium", recommendation: "Opus de una generación atrás, potente pero ya superado por 4.7/4.8/5." },
      { id: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", tier: "premium", recommendation: "Opus más antiguo, todavía capaz para tareas complejas si prefieres esta versión." },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", tier: "fast", recommendation: "Rápido y económico. Ideal para alto volumen y respuestas simples." },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", tier: "balanced", recommendation: "Sonnet de la generación anterior, calidad/costo sólido." },
      { id: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1", tier: "premium", recommendation: "Opus de generación más antigua, mantiene buen razonamiento." },
      { id: "anthropic/claude-opus-4", label: "Claude Opus 4", tier: "premium", recommendation: "La primera versión de Opus 4, todavía disponible si la necesitas." },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", tier: "balanced", recommendation: "Sonnet original de la generación 4." },
      { id: "anthropic/claude-3-haiku", label: "Claude 3 Haiku", tier: "fast", recommendation: "El Haiku más antiguo y económico. Solo para tareas muy simples o compatibilidad con configuraciones previas." },
    ],
  },
  {
    provider: "openai",
    label: "OpenAI",
    models: [
      { id: "openai/gpt-5.6-luna-pro", label: "GPT-5.6 Luna Pro", tier: "premium", recommendation: "Variante Pro de la línea Luna, para las tareas más exigentes de esta familia." },
      { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", tier: "balanced", recommendation: "Línea Luna de GPT-5.6, buen equilibrio calidad/costo." },
      { id: "openai/gpt-5.6-terra-pro", label: "GPT-5.6 Terra Pro", tier: "premium", recommendation: "Variante Pro de la línea Terra." },
      { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", tier: "balanced", recommendation: "Línea Terra de GPT-5.6, buen equilibrio calidad/costo." },
      { id: "openai/gpt-5.6-sol-pro", label: "GPT-5.6 Sol Pro", tier: "premium", recommendation: "Variante Pro de la línea Sol." },
      { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol", tier: "balanced", recommendation: "Línea Sol de GPT-5.6, buen equilibrio calidad/costo." },
      { id: "openai/gpt-chat-latest", label: "GPT Chat Latest", tier: "balanced", recommendation: "Siempre apunta al modelo de chat más reciente de OpenAI, sin tener que cambiarlo a mano cuando actualicen." },
      { id: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", tier: "premium", recommendation: "Máxima precisión y uso de herramientas de la generación 5.5." },
      { id: "openai/gpt-5.5", label: "GPT-5.5", tier: "balanced", recommendation: "Muy capaz, buen equilibrio calidad/costo." },
      { id: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano", tier: "fast", recommendation: "El más económico de la generación 5.4. Para tareas cortas de alto volumen." },
      { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", tier: "fast", recommendation: "Rápido y económico, buena opción para agendamiento y soporte simple." },
      { id: "openai/gpt-5.4-pro", label: "GPT-5.4 Pro", tier: "premium", recommendation: "La versión más potente de GPT-5.4." },
      { id: "openai/gpt-5.4", label: "GPT-5.4", tier: "balanced", recommendation: "Sólido y versátil para soporte general." },
      { id: "openai/gpt-5.3-chat", label: "GPT-5.3 Chat", tier: "balanced", recommendation: "Afinado específicamente para conversación." },
      { id: "openai/gpt-5.3-codex", label: "GPT-5.3-Codex", tier: "premium", recommendation: "Especializado en programación y uso de herramientas técnicas." },
      { id: "openai/gpt-5.2-codex", label: "GPT-5.2-Codex", tier: "premium", recommendation: "Versión anterior especializada en programación." },
      { id: "openai/gpt-5.2-chat", label: "GPT-5.2 Chat", tier: "balanced", recommendation: "Afinado para conversación de la generación 5.2." },
      { id: "openai/gpt-5.2-pro", label: "GPT-5.2 Pro", tier: "premium", recommendation: "La versión más potente de GPT-5.2." },
      { id: "openai/gpt-5.2", label: "GPT-5.2", tier: "balanced", recommendation: "Sólido y versátil para soporte general." },
      { id: "openai/gpt-5.1-codex-max", label: "GPT-5.1-Codex-Max", tier: "premium", recommendation: "La versión más potente de la línea Codex 5.1, para tareas técnicas exigentes." },
      { id: "openai/gpt-5.1", label: "GPT-5.1", tier: "balanced", recommendation: "Generación 5.1, confiable para uso general." },
      { id: "openai/gpt-5.1-chat", label: "GPT-5.1 Chat", tier: "balanced", recommendation: "Afinado para conversación de la generación 5.1." },
      { id: "openai/gpt-5.1-codex", label: "GPT-5.1-Codex", tier: "balanced", recommendation: "Especializado en programación, generación 5.1." },
      { id: "openai/gpt-5.1-codex-mini", label: "GPT-5.1-Codex-Mini", tier: "fast", recommendation: "Versión económica de Codex 5.1 para tareas técnicas simples." },
      { id: "openai/gpt-5-pro", label: "GPT-5 Pro", tier: "premium", recommendation: "Máxima precisión y uso de herramientas de la primera generación GPT-5." },
      { id: "openai/gpt-5", label: "GPT-5", tier: "balanced", recommendation: "La base de la generación GPT-5, confiable para tareas exigentes." },
      { id: "openai/gpt-5-mini", label: "GPT-5 Mini", tier: "fast", recommendation: "Rápido y económico dentro de la generación GPT-5." },
      { id: "openai/gpt-5-nano", label: "GPT-5 Nano", tier: "fast", recommendation: "El más económico de la generación GPT-5. Para agendamiento y respuestas cortas de alto volumen." },
      { id: "openai/gpt-oss-120b", label: "gpt-oss-120b", tier: "balanced", recommendation: "Modelo de pesos abiertos de OpenAI, buena capacidad general." },
      { id: "openai/gpt-oss-20b", label: "gpt-oss-20b", tier: "fast", recommendation: "Versión más pequeña y económica de los modelos de pesos abiertos de OpenAI." },
      { id: "openai/o3-pro", label: "o3 Pro", tier: "premium", recommendation: "Razonamiento profundo para los problemas más difíciles, con más tiempo de cómputo." },
      { id: "openai/o4-mini-high", label: "o4 Mini High", tier: "balanced", recommendation: "Razonamiento rápido con más esfuerzo de cómputo que la versión estándar." },
      { id: "openai/o3", label: "o3", tier: "premium", recommendation: "Modelo de razonamiento avanzado para problemas complejos." },
      { id: "openai/o4-mini", label: "o4 Mini", tier: "fast", recommendation: "Razonamiento rápido y económico." },
      { id: "openai/gpt-4.1", label: "GPT-4.1", tier: "balanced", recommendation: "Confiable y económico para tareas estándar." },
      { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", tier: "fast", recommendation: "Rápido y económico, buena opción para alto volumen." },
      { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", tier: "fast", recommendation: "El más ligero de la familia 4.1, ideal para tareas simples de alto volumen." },
      { id: "openai/o1-pro", label: "o1-pro", tier: "premium", recommendation: "Razonamiento profundo con más tiempo de cómputo, generación o1." },
      { id: "openai/o3-mini-high", label: "o3 Mini High", tier: "balanced", recommendation: "Razonamiento con más esfuerzo de cómputo, versión mini." },
      { id: "openai/o3-mini", label: "o3 Mini", tier: "fast", recommendation: "Razonamiento rápido y económico." },
      { id: "openai/o1", label: "o1", tier: "premium", recommendation: "Modelo de razonamiento avanzado, generación anterior a o3." },
      { id: "openai/gpt-4o-mini", label: "GPT-4o-mini", tier: "fast", recommendation: "Rápido y económico. Buena opción para alto volumen." },
      { id: "openai/gpt-4o", label: "GPT-4o", tier: "balanced", recommendation: "Modelo multimodal estable, buen equilibrio calidad/costo." },
      { id: "openai/gpt-4-turbo", label: "GPT-4 Turbo", tier: "balanced", recommendation: "Generación anterior, todavía confiable para tareas estándar." },
      { id: "openai/gpt-3.5-turbo", label: "GPT-3.5 Turbo", tier: "fast", recommendation: "El más económico y veloz, para tareas muy simples o alto volumen." },
      { id: "openai/gpt-4", label: "GPT-4", tier: "balanced", recommendation: "El GPT-4 original. Disponible por compatibilidad, hoy superado por generaciones más nuevas." },
    ],
  },
  {
    provider: "gemini",
    label: "Google Gemini",
    models: [
      { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash", tier: "balanced", recommendation: "La versión más reciente de Flash: rápida, con contexto enorme." },
      { id: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", tier: "fast", recommendation: "La opción más económica y veloz de la generación 3.5, para alto volumen." },
      { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", tier: "balanced", recommendation: "Contexto enorme y muy rápido. Bueno cuando necesitas procesar mucho texto." },
      { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", tier: "fast", recommendation: "Rápido y barato para alto volumen." },
      { id: "google/gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite Preview", tier: "fast", recommendation: "Versión preview de Flash Lite 3.1, mismas ventajas de costo/velocidad." },
      { id: "google/gemini-3.1-pro-preview-customtools", label: "Gemini 3.1 Pro Preview (Custom Tools)", tier: "premium", recommendation: "Variante Pro de 3.1 optimizada para uso de herramientas personalizadas." },
      { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", tier: "premium", recommendation: "Más capacidad que Flash, manteniendo buena velocidad y contexto amplio." },
      { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview", tier: "balanced", recommendation: "Versión preview de Flash, generación 3." },
      { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "fast", recommendation: "Rápido y económico, generación 2.5." },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "balanced", recommendation: "Buen equilibrio calidad/costo, generación 2.5." },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "premium", recommendation: "Versión Pro estable de la generación 2.5, mayor capacidad de razonamiento." },
      { id: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro Preview 06-05", tier: "premium", recommendation: "Versión preview de Pro 2.5." },
      { id: "google/gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro Preview 05-06", tier: "premium", recommendation: "Snapshot anterior de la preview de Pro 2.5." },
    ],
  },
  {
    provider: "deepseek",
    label: "DeepSeek",
    models: [
      { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", tier: "premium", recommendation: "Lo más potente de DeepSeek. Razonamiento complejo a buen costo frente a otros modelos premium." },
      { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "fast", recommendation: "Versión rápida y económica de la generación V4." },
      { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", tier: "balanced", recommendation: "Buen equilibrio calidad/costo de la generación V3.2." },
      { id: "deepseek/deepseek-v3.2-exp", label: "DeepSeek V3.2 Exp", tier: "balanced", recommendation: "Variante experimental de V3.2, puede incluir mejoras aún no estables." },
      { id: "deepseek/deepseek-v3.1-terminus", label: "DeepSeek V3.1 Terminus", tier: "balanced", recommendation: "Versión estable final de la serie V3.1." },
      { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", tier: "balanced", recommendation: "Afinado para conversación, generación V3.1." },
      { id: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528", tier: "premium", recommendation: "Modelo de razonamiento de DeepSeek, snapshot de mayo. Bueno para problemas complejos a bajo costo." },
      { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3 0324", tier: "balanced", recommendation: "Snapshot de la generación V3, afinado para conversación." },
      { id: "deepseek/deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill Llama 70B", tier: "fast", recommendation: "Versión destilada de R1 sobre Llama 70B, más ligera y rápida." },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1", tier: "premium", recommendation: "Modelo de razonamiento insignia de DeepSeek, muy buena relación calidad/precio." },
      { id: "deepseek/deepseek-chat", label: "DeepSeek V3", tier: "balanced", recommendation: "La opción general por defecto de la marca." },
    ],
  },
  {
    provider: "kimi",
    label: "Kimi (Moonshot AI)",
    models: [
      { id: "moonshotai/kimi-k3", label: "Kimi K3", tier: "premium", recommendation: "Lo más reciente y potente de Kimi. Contexto enorme, buen razonamiento." },
      { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code", tier: "balanced", recommendation: "Especializado en programación." },
      { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6", tier: "balanced", recommendation: "Buen equilibrio calidad/costo de la generación K2.6." },
      { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5", tier: "balanced", recommendation: "Generación K2.5, contexto amplio." },
      { id: "moonshotai/kimi-k2-thinking", label: "Kimi K2 Thinking", tier: "premium", recommendation: "Variante con razonamiento extendido, para problemas más complejos." },
      { id: "moonshotai/kimi-k2-0905", label: "Kimi K2 0905", tier: "balanced", recommendation: "Snapshot de septiembre de K2." },
      { id: "moonshotai/kimi-k2", label: "Kimi K2 0711", tier: "balanced", recommendation: "Versión original K2, contexto amplio y buen costo." },
    ],
  },
];

const FLAT_MODELS: { provider: ProviderKey; model: CatalogModel }[] =
  MODEL_CATALOG.flatMap((p) =>
    p.models.map((model) => ({ provider: p.provider, model })),
  );

export const ALL_CATALOG_IDS: string[] = FLAT_MODELS.map((m) => m.model.id);

export function findCatalogModel(
  id: string | null | undefined,
): { provider: ProviderKey; model: CatalogModel } | undefined {
  if (!id) return undefined;
  return FLAT_MODELS.find((m) => m.model.id === id);
}

export const TIER_LABEL: Record<ModelTier, string> = {
  premium: "Premium",
  balanced: "Equilibrado",
  fast: "Rápido",
};

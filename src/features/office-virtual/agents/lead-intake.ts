import { type AgentInput, LeadBriefSchema, type LeadBrief } from '../schemas';
import type { AgentRunner } from './types';

const NICHE_KEYWORDS: Record<string, string[]> = {
  'Tienda / e-commerce': ['tienda', 'ecommerce', 'e-commerce', 'zapatos', 'ropa', 'productos', 'catálogo'],
  'Restauración': ['restaurante', 'bar', 'cafetería', 'comida', 'reservas'],
  'Salud / clínica': ['clínica', 'consulta', 'paciente', 'dentista', 'médico', 'salud'],
  'Inmobiliaria': ['inmobiliaria', 'pisos', 'alquiler', 'propiedades'],
  'Agencia / servicios': ['agencia', 'consultora', 'estudio', 'freelance'],
  'SaaS / software': ['software', 'app', 'saas', 'plataforma'],
};

const CHANNEL_KEYWORDS: Record<string, string[]> = {
  WhatsApp: ['whatsapp'],
  Instagram: ['instagram', 'ig'],
  Web: ['web', 'página', 'formulario', 'landing'],
  Email: ['email', 'correo'],
  Teléfono: ['llamada', 'teléfono', 'telefono'],
};

const PAIN_KEYWORDS = [
  'lento',
  'pierdo',
  'no doy abasto',
  'manual',
  'tardo',
  'no tengo tiempo',
  'se me escapan',
  'no contesto',
  'demasiados mensajes',
];

const HIGH_URGENCY = ['ya', 'urgente', 'cuanto antes', 'esta semana', 'hoy'];
const MEDIUM_URGENCY = ['pronto', 'este mes', 'próximas semanas'];

function detectFromKeywords(text: string, dict: Record<string, string[]>): string | null {
  const lower = text.toLowerCase();
  for (const [label, keywords] of Object.entries(dict)) {
    if (keywords.some((k) => lower.includes(k))) return label;
  }
  return null;
}

function detectPainPoints(text: string): string[] {
  const lower = text.toLowerCase();
  const found = PAIN_KEYWORDS.filter((k) => lower.includes(k));
  if (found.length > 0) return found.map((k) => `Menciona: "${k}"`);
  return [];
}

function detectUrgency(text: string): 'low' | 'medium' | 'high' {
  const lower = text.toLowerCase();
  if (HIGH_URGENCY.some((k) => lower.includes(k))) return 'high';
  if (MEDIUM_URGENCY.some((k) => lower.includes(k))) return 'medium';
  return 'low';
}

export const leadIntakeAgent: AgentRunner<AgentInput, LeadBrief> = {
  id: 'lead-intake',
  promptVersion: 'v1',
  async run({ text }) {
    const niche = detectFromKeywords(text, NICHE_KEYWORDS);
    const channel = detectFromKeywords(text, CHANNEL_KEYWORDS);
    const painPoints = detectPainPoints(text);

    const missingInfo: string[] = [];
    if (!niche) missingInfo.push('niche');
    if (!channel) missingInfo.push('channel');
    if (painPoints.length === 0) missingInfo.push('painPoints');

    const confidence = Math.max(0.2, 1 - missingInfo.length * 0.25);

    const brief: LeadBrief = {
      summary: text.trim().slice(0, 220),
      company: 'No especificado',
      niche: niche ?? 'No especificado',
      channel: channel ?? 'No especificado',
      painPoints: painPoints.length > 0 ? painPoints : ['No especificado'],
      urgency: detectUrgency(text),
      confidence,
      missingInfo,
    };

    return LeadBriefSchema.parse(brief);
  },
};

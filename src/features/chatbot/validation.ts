import { z } from 'zod';
import { CHATBOT_PROVIDERS, CHATBOT_USE_CASES } from './types';

export const ChatbotFaqSchema = z.object({
  id: z.string().trim().min(1).max(300),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(4_000),
}).strict();

export const ChatbotDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  useCase: z.enum(CHATBOT_USE_CASES),
  purpose: z.string().trim().min(1).max(500),
  accessNote: z.string().trim().max(500),
  instructions: z.string().trim().min(1).max(12_000),
  faqs: z.array(ChatbotFaqSchema).min(1).max(100),
  fallbackMessage: z.string().trim().min(1).max(1_000),
  model: z.string().trim().min(1).max(200),
}).strict();

export const ChatbotDraftPatchSchema = ChatbotDraftSchema.partial().strict();

export const ChatbotCommandBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update_draft'), patch: ChatbotDraftPatchSchema }).strict(),
  z.object({ type: z.literal('select_channel'), provider: z.enum(CHATBOT_PROVIDERS).nullable() }).strict(),
  z.object({ type: z.literal('publish') }).strict(),
  z.object({ type: z.literal('set_enabled'), enabled: z.boolean() }).strict(),
]);

export const ChatbotPostBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  command: ChatbotCommandBodySchema,
});

export const ChatbotTestBodySchema = z.object({
  question: z.string().trim().min(1).max(2_000),
});

import { z } from 'zod';
import type { MemoryMutationEvent } from './types';

const IdentifierSchema = z.string().trim().min(1).max(300);
const TextSchema = z.string().trim().min(1).max(5_000);
const IsoDateSchema = z.string().refine(
  (value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
  'Expected a valid ISO-8601 timestamp with timezone',
);
const SourceSchema = z.enum(['whatsapp', 'voice', 'manual', 'automation']);
const CategorySchema = z.enum([
  'identity',
  'preference',
  'need',
  'objection',
  'purchase',
  'appointment',
  'relationship',
  'instruction',
  'other',
]);

export const ContactMemoryItemSchema = z
  .object({
    id: IdentifierSchema,
    category: CategorySchema,
    value: TextSchema,
    source: SourceSchema,
    confidence: z.number().min(0).max(1),
    sensitivity: z.enum(['normal', 'sensitive']),
    createdAt: IsoDateSchema,
    lastConfirmedAt: IsoDateSchema.optional(),
    evidenceEntityId: IdentifierSchema.optional(),
  })
  .strict();

const BaseEventSchema = z.object({
  id: IdentifierSchema,
  workspaceId: IdentifierSchema,
  contactId: IdentifierSchema,
  source: SourceSchema,
  occurredAt: IsoDateSchema,
});

export const MemoryMutationEventSchema: z.ZodType<MemoryMutationEvent> = z.discriminatedUnion('kind', [
  BaseEventSchema.extend({
    kind: z.literal('profile.upserted'),
    displayName: z.string().trim().min(1).max(300).optional(),
    phoneMasked: z.string().trim().min(1).max(100).optional(),
  }).strict(),
  BaseEventSchema.extend({
    kind: z.literal('summary.updated'),
    summary: TextSchema,
    summarySources: z.array(SourceSchema).min(1),
  }).strict(),
  BaseEventSchema.extend({
    kind: z.literal('item.upserted'),
    item: ContactMemoryItemSchema,
  }).strict(),
  BaseEventSchema.extend({
    kind: z.literal('item.forgotten'),
    itemId: IdentifierSchema,
  }).strict(),
]);

export type MemoryValidationIssue = { path: string; message: string };
export type MemoryValidationResult =
  | { success: true; event: MemoryMutationEvent }
  | { success: false; error: 'invalid_memory_event'; issues: MemoryValidationIssue[] };

export function validateMemoryMutationEvent(input: unknown): MemoryValidationResult {
  const parsed = MemoryMutationEventSchema.safeParse(input);
  if (parsed.success) return { success: true, event: parsed.data };
  return {
    success: false,
    error: 'invalid_memory_event',
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '$',
      message: issue.message,
    })),
  };
}


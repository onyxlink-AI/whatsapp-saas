import { z } from 'zod';
import {
  OPENROUTER_CONNECTION_KINDS,
  OpenRouterConnectionBindingSchema,
  OpenRouterConnectionReportSchema,
} from './client/central-orchestration';

const IdentifierSchema = z.string().trim().min(1).max(300);

export const OfficeOpenRouterActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('provision_connection'),
    workspaceId: IdentifierSchema,
    connectionKind: z.enum(OPENROUTER_CONNECTION_KINDS),
  }).strict(),
  z.object({
    type: z.literal('verify_connection'),
    workspaceId: IdentifierSchema,
    connectionId: IdentifierSchema,
  }).strict(),
  z.object({
    type: z.literal('revoke_connection'),
    workspaceId: IdentifierSchema,
    connectionId: IdentifierSchema,
  }).strict(),
]);

export const OfficeOpenRouterRequestSchema = z.object({
  requestId: IdentifierSchema,
  workspaceId: IdentifierSchema,
  action: OfficeOpenRouterActionSchema,
}).strict().superRefine((request, context) => {
  if (request.action.workspaceId !== request.workspaceId) {
    context.addIssue({
      code: 'custom',
      path: ['action', 'workspaceId'],
      message: 'Action workspace must match request workspace.',
    });
  }
});

export const OfficeOpenRouterSnapshotResponseSchema = z.object({
  binding: OpenRouterConnectionBindingSchema,
}).strict();

export const OfficeOpenRouterActionResponseSchema = z.object({
  report: OpenRouterConnectionReportSchema,
}).strict();

export type OfficeOpenRouterRequest = z.infer<typeof OfficeOpenRouterRequestSchema>;

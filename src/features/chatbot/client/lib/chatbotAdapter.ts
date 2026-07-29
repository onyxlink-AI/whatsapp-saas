import type { ChatbotDocument, ChatbotProvider } from '../../types';
import type { ChatbotCommandBodySchema } from '../../validation';
import type { z } from 'zod';

export type ChatbotCommandInput = z.infer<typeof ChatbotCommandBodySchema>;

export type ChatbotHeadResponse = {
  revision: number;
  status: ChatbotDocument['status'];
  enabled: boolean;
  document: ChatbotDocument;
  updatedAt: string;
  updatedBy: string;
};

export type ChannelEligibility = { eligible: boolean; reason: string | null };
export type ChatbotChannels = Record<ChatbotProvider, ChannelEligibility>;

export type ChatbotLoadResult =
  | { status: 'ok'; head: ChatbotHeadResponse; channels: ChatbotChannels }
  | { status: 'error'; message: string };

export type ChatbotCommandResult =
  | { status: 'ok'; document: ChatbotDocument; channels: ChatbotChannels }
  | { status: 'error'; code: string | null; issues?: { field: string; message: string }[]; message: string };

export type ChatbotTestResult =
  | { status: 'ok'; answer: string; source: 'openrouter' | 'fallback' }
  | { status: 'error'; message: string };

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function fetchChatbot(workspaceId: string): Promise<ChatbotLoadResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/chatbot`);
    if (!response.ok) return { status: 'error', message: await readError(response) };
    const body = (await response.json()) as { head: ChatbotHeadResponse; channels: ChatbotChannels };
    return { status: 'ok', head: body.head, channels: body.channels };
  } catch {
    return { status: 'error', message: 'No se pudo cargar la configuración del Chatbot.' };
  }
}

export async function sendChatbotCommand(
  workspaceId: string,
  expectedRevision: number,
  command: ChatbotCommandInput,
): Promise<ChatbotCommandResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/chatbot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision, command }),
    });
    if (!response.ok) {
      let code: string | null = null;
      let issues: { field: string; message: string }[] | undefined;
      try {
        const body = (await response.json()) as { error?: string; issues?: { field: string; message: string }[] };
        code = body.error ?? null;
        issues = body.issues;
      } catch {
        // ignore — code stays null, generic message below
      }
      return { status: 'error', code, issues, message: code ?? `HTTP ${response.status}` };
    }
    const body = (await response.json()) as { document: ChatbotDocument; channels: ChatbotChannels };
    return { status: 'ok', document: body.document, channels: body.channels };
  } catch {
    return { status: 'error', code: null, message: 'No se pudo contactar con el backend del Chatbot.' };
  }
}

export async function testChatbotQuestion(workspaceId: string, question: string): Promise<ChatbotTestResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/chatbot/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) return { status: 'error', message: await readError(response) };
    const body = (await response.json()) as { answer: string; source: 'openrouter' | 'fallback' };
    return { status: 'ok', answer: body.answer, source: body.source };
  } catch {
    return { status: 'error', message: 'No se pudo probar el Chatbot.' };
  }
}

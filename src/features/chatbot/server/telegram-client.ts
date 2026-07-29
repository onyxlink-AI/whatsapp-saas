const TELEGRAM_API_BASE = 'https://api.telegram.org';

export class TelegramError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramError';
  }
}

/** Sends a plain text message via the Telegram Bot API. Throws TelegramError on non-2xx responses. */
export async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // ignore
    }
    throw new TelegramError(response.status, body, `Telegram sendMessage failed with status ${response.status}`);
  }
}

export type SetWebhookResult = { ok: true } | { ok: false; description: string };

/** Registers the workspace's inbound webhook URL with Telegram. Requires a public HTTPS URL. */
export async function setTelegramWebhook(botToken: string, url: string, secretToken: string): Promise<SetWebhookResult> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken }),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (response.ok && body?.ok) return { ok: true };
  return { ok: false, description: body?.description ?? `HTTP ${response.status}` };
}

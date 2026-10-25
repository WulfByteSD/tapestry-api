export class DiscordBotError extends Error {
  constructor(public kind: 'rate_limit' | 'permanent' | 'unavailable', message: string, public retryAfterMs = 0) { super(message); }
}

export function discordBotReady(): boolean { return Boolean(process.env.DISCORD_BOT_TOKEN?.trim()); }

export async function discordBotRequest<T>(path: string, body?: unknown): Promise<{ data: T; cooldownMs: number }> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) throw new DiscordBotError('permanent', 'Discord roll delivery is not configured on this server.');
  let response: Response;
  try {
    response = await fetch(`https://discord.com/api/v10${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bot ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new DiscordBotError('unavailable', 'Discord did not confirm the request.'); }
  let data: unknown;
  try { data = await response.json(); } catch { data = null; }
  const seconds = (value: unknown) => {
    const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : 0;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const delay = (value: number) => Math.min(Math.ceil(value * 1000) + 250, 8_640_000_000_000_000 - Date.now() - 1000);
  if (response.status === 429) {
    const retry = Math.max(seconds((data as { retry_after?: unknown } | null)?.retry_after), seconds(response.headers.get('retry-after')), seconds(response.headers.get('x-ratelimit-reset-after')), 1);
    throw new DiscordBotError('rate_limit', 'Discord is rate limiting roll delivery. Waiting before trying again.', delay(retry));
  }
  if (!response.ok) {
    if ([400, 401, 403, 404].includes(response.status)) throw new DiscordBotError('permanent', response.status === 401 ? 'Discord rejected the bot credentials. Ask the server administrator to check its configuration.' : 'Discord rejected delivery. Check the mapped channel and bot permissions.');
    throw new DiscordBotError('unavailable', 'Discord did not confirm the request.');
  }
  if (!data || typeof data !== 'object') throw new DiscordBotError('unavailable', 'Discord returned an unreadable confirmation.');
  const cooldownMs = response.headers.get('x-ratelimit-remaining') === '0' ? delay(seconds(response.headers.get('x-ratelimit-reset-after'))) : 0;
  return { data: data as T, cooldownMs };
}

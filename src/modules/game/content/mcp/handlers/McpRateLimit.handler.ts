import { presenceClient } from '../../../../../config/redis';
import { Actor } from '../types/McpTypes';
import { McpError } from '../util/McpError';
import { digest } from '../util/mcpCredentials';

export type LimitStore = { eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown> };
const incrementWindow = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count`;

/** Shared Redis windows enforce limits across every Express cluster worker. */
export class McpRateLimitHandler {
  constructor(private store: LimitStore = presenceClient) {}

  /** Fail closed if the shared limiter cannot answer; never fall back to per-process counters. */
  async consume(bucket: string, identity: string, limit: number) {
    const key = `content-mcp:${bucket}:${digest(identity)}:${Math.floor(Date.now() / 60000)}`;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const count = await Promise.race([this.store.eval(incrementWindow, 1, key, 61000), new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new McpError('unavailable', 'The shared limiter is unavailable.', 503)), 2000);
      })]);
      if (!Number.isSafeInteger(Number(count)) || Number(count) < 1) throw new McpError('unavailable', 'The shared limiter returned an invalid result.', 503);
      if (Number(count) > limit) throw new McpError('rate_limited', 'This connection exceeded its minute limit.', 429);
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError('unavailable', 'The shared limiter is unavailable.', 503);
    } finally { if (timeout) clearTimeout(timeout); }
  }

  /** Charge each proposed or applied content operation independently, including entries inside a batch. */
  async write(actor: Actor) { await this.consume('writes', actor.grantId, 60); }
}

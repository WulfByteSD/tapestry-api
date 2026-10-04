import { ClientSession } from 'mongoose';
import { z } from 'zod';
import { McpOperation } from '../model/McpOperation';
import { McpError } from '../util/McpError';
import { digest, stable } from '../util/mcpCredentials';
import { transaction } from '../util/mcpTransaction';

/** Persist one outcome per actor/operation ID; identical retries replay it and changed payloads conflict across workers. */
export async function once<T>(actorKey: string, operationId: string, payload: any, work: (session: ClientSession) => Promise<T>): Promise<T> {
  z.string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9:_-]+$/)
    .parse(operationId);
  const payloadHash = digest(stable(payload));
  const replay = async (session?: ClientSession) => {
    const saved = await McpOperation.findOne({ actorKey, operationId })
      .session(session || null)
      .lean();
    if (saved && saved.payloadHash !== payloadHash) throw new McpError('conflict', 'This operation ID was already used for a different payload.', 409);
    return saved;
  };
  try {
    return await transaction(async (session) => {
      const saved = await replay(session);
      if (saved) return saved.result as T;
      const result = await work(session);
      await McpOperation.create([{ actorKey, operationId, payloadHash, result }], { session });
      return result;
    });
  } catch (error) {
    if ((error as any)?.code === 11000) {
      const saved = await replay();
      if (saved) return saved.result as T;
    }
    throw error;
  }
}

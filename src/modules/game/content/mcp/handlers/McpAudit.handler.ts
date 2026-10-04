import { ClientSession } from 'mongoose';
import { Actor } from '../types/McpTypes';
import { McpAudit } from '../model/McpAudit';

/** Persist an audit event, optionally in the same transaction as its content mutation. */
export async function audit(actor: Actor | string | undefined, event: string, detail: Record<string, any> = {}, session?: ClientSession) {
  const identity =
    typeof actor === 'object' ? { actorKey: `grant:${actor.grantId}`, clientId: actor.clientId, ownerId: actor.ownerId, grantId: actor.grantId } : { actorKey: actor };
  await McpAudit.create([{ ...identity, event, ...detail }], { session });
}

import { ClientSession } from 'mongoose';
import Auth from '../../../../auth/model/Auth';
import { McpClient } from '../model/McpClient';
import { McpGrant } from '../model/McpGrant';
import { Actor, Capability } from '../types/McpTypes';
import { McpError } from '../util/McpError';

/** Resolve the current client, grant, and active verified owner. Token scopes form a ceiling on later grant changes. */
export async function loadActor(grantId: string, clientId: string, ceiling?: Capability[], session?: ClientSession): Promise<Actor> {
  const grant = await McpGrant.findOne({ _id: grantId, clientId, isActive: true, expiresAt: { $gt: new Date() } })
    .session(session || null)
    .lean();
  const client = await McpClient.findOne({ clientId, isActive: true })
    .session(session || null)
    .lean();
  const owner =
    grant &&
    (await Auth.findOne({ _id: grant.ownerId, isActive: true, isEmailVerified: true })
      .session(session || null)
      .lean());
  if (!grant || !client || !owner || grant.kind !== client.kind) throw new McpError('invalid_token', 'This connection is inactive, expired, or revoked.', 401);
  const scopes: Capability[] = ceiling || grant.capabilities;
  return {
    grantId: String(grant._id),
    clientId,
    ownerId: String(grant.ownerId),
    capabilities: grant.capabilities.filter((c: Capability) => scopes.includes(c)),
    ceiling: scopes,
    contentTypes: grant.contentTypes,
    settingKeys: grant.settingKeys,
    shared: grant.shared,
  };
}
/** Reload permissions and serialize a write against concurrent grant changes and client revocation. */
export async function touchActor(actor: Actor, session: ClientSession): Promise<Actor> {
  const current = await loadActor(actor.grantId, actor.clientId, actor.ceiling, session);
  // These writes serialize content commits against grant changes/client revocation.
  await McpGrant.updateOne({ _id: actor.grantId }, { $inc: { useCount: 1 } }, { session });
  await McpClient.updateOne({ clientId: actor.clientId }, { $inc: { useCount: 1 } }, { session });
  return current;
}

import mongoose, { ClientSession } from 'mongoose';
import { randomUUID } from 'crypto';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import CampaignModel from '../../campaigns/model/CampaignModel';
import { emitChatToPlayers } from '../../campaigns/chat/chatEvents';
import PurseAudit from '../model/PurseAudit';
import { fingerprint } from './progressionContracts';
import { purseSnapshot, PurseSnapshot } from './characterPurse';

export interface PurseAuditContext {
  actorId: string;
  actorName?: string;
  action?: 'mark' | 'clear' | 'clear_all' | 'set_base_capacity' | 'capacity_changed' | 'copy_origin';
  source: 'player' | 'storyweaver' | 'manual_weave' | 'advance_weave' | 'reset_weaves' | 'character_copy';
  note?: string;
  requestId?: string;
  dedupeKey?: string;
  fingerprint?: string;
}

export const purseConflict = () => new ErrorUtil('The character or Purse changed. Reload and review before saving again.', 409);

export async function purseCampaign(character: any, session?: ClientSession) {
  if (!character.campaign || character.status !== 'active') return null;
  const campaign = await CampaignModel.findOne({ _id: character.campaign, status: 'active' }).session(session ?? null).lean();
  if (!campaign) return null;
  const owner = String(character.player);
  return String(campaign.owner) === owner || campaign.members.some(member => String(member.player) === owner) ? campaign : null;
}

export async function withPurseTransaction<T>(work: (session: ClientSession) => Promise<T>, retryTransient = false): Promise<T> {
  const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
  if (!hello || (!hello.setName && hello.msg !== 'isdbgrid')) throw new ErrorUtil('Saving Purse changes requires transactional storage. No changes were saved.', 503);
  const session = await mongoose.startSession();
  try {
    // The dedicated endpoint reloads its documents on each attempt, so MongoDB
    // can safely retry a conflict and discover a concurrent idempotent result.
    if (retryTransient) return await session.withTransaction(() => work(session));
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction().catch(() => undefined);
    throw error;
  } finally { await session.endSession(); }
}

export async function createPurseAudit(character: any, before: PurseSnapshot, context: PurseAuditContext, session: ClientSession) {
  const campaign = await purseCampaign(character, session);
  const actor = context.actorName ? null : await PlayerModel.findById(context.actorId).select('displayName').session(session).lean();
  const requestId = context.requestId ?? randomUUID();
  const after = purseSnapshot(character);
  const [entry] = await PurseAudit.create([{
    character: character._id,
    requestId,
    dedupeKey: context.dedupeKey ?? `${context.source}:${requestId}`,
    fingerprint: context.fingerprint ?? fingerprint({ actor: context.actorId, source: context.source, before, after }),
    actor: { playerId: context.actorId, name: context.actorName || actor?.displayName || 'Player' },
    action: context.action ?? 'capacity_changed', source: context.source,
    campaign: campaign?._id, campaignName: campaign?.name,
    note: context.note ?? '', before, after, revision: character.__v ?? 0,
  }], { session });
  return entry;
}

/** Ordinary saves need a transaction only when their derived capacity changes. */
export async function saveWithPurseCapacityAudit(character: any, before: PurseSnapshot, context: PurseAuditContext, session?: ClientSession) {
  const after = purseSnapshot(character);
  if (before.capacity === after.capacity) return character.save({ session });
  const save = async (transaction: ClientSession) => {
    await character.save({ session: transaction });
    await createPurseAudit(character, before, context, transaction);
    return character;
  };
  return session ? save(session) : withPurseTransaction(save);
}

export async function notifyPurseUpdated(character: any) {
  const campaign = await purseCampaign(character);
  const managers = campaign ? [String(campaign.owner), ...campaign.members.filter(member => ['sw', 'co-sw'].includes(member.role)).map(member => String(member.player))] : [];
  emitChatToPlayers([String(character.player), ...managers], 'character:purseUpdated', { characterId: String(character._id), ...(campaign ? { campaignId: String(campaign._id) } : {}) });
}

export function purseAuditResponse(entry: any) {
  return {
    id: String(entry._id), characterId: String(entry.character),
    actor: { playerId: String(entry.actor.playerId), name: entry.actor.name },
    action: entry.action, source: entry.source,
    ...(entry.campaign ? { campaignId: String(entry.campaign), campaignName: entry.campaignName } : {}),
    note: entry.note, before: entry.before, after: entry.after, createdAt: entry.createdAt,
  };
}

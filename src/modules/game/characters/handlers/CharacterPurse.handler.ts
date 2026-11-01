import { ClientSession } from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CharacterModel from '../model/CharacterModel';
import PurseAudit from '../model/PurseAudit';
import { purseSnapshot } from '../helpers/characterPurse';
import { parse, objectId, fingerprint } from '../helpers/progressionContracts';
import { purseChangeInput, purseQueryInput } from '../helpers/purseContracts';
import { createPurseAudit, notifyPurseUpdated, purseAuditResponse, purseCampaign, purseConflict, withPurseTransaction } from '../helpers/pursePersistence';

export default class CharacterPurseHandler {
  private async access(player: any, id: string, session?: ClientSession) {
    parse(objectId, id);
    const character = await CharacterModel.findOne({ _id: id, 'meta.deletedAt': null }).session(session ?? null);
    if (!character) throw new ErrorUtil('Character not found.', 404);
    const owner = String(character.player) === String(player._id);
    const campaign = await purseCampaign(character, session);
    const member = campaign?.members.find(entry => String(entry.player) === String(player._id));
    const manager = campaign && (String(campaign.owner) === String(player._id) || ['sw', 'co-sw'].includes(member?.role ?? ''));
    if (!owner && !manager) throw new ErrorUtil('Only the character owner or current campaign Storyweavers can manage this Purse.', 403);
    return { character, owner, campaign, permissions: { canManageMarks: true, canEditBaseCapacity: owner } };
  }

  async get(player: any, id: string, rawQuery: unknown = {}) {
    const query = parse(purseQueryInput, rawQuery);
    const access = await this.access(player, id);
    const filter: any = { character: id, ...(!access.owner ? { campaign: access.campaign!._id } : {}) };
    if (query.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
        parse(objectId, cursor.id);
        const date = new Date(cursor.createdAt);
        if (typeof cursor.createdAt !== 'string' || !Number.isFinite(date.getTime()) || date.toISOString() !== cursor.createdAt) throw new Error();
        filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: cursor.id } }];
      } catch { throw new ErrorUtil('Invalid Purse history cursor.', 400); }
    }
    const records = await PurseAudit.find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit + 1).lean();
    const entries = records.slice(0, query.limit);
    const last = entries[entries.length - 1];
    return {
      snapshot: purseSnapshot(access.character), revision: access.character.__v ?? 0,
      history: entries.map(purseAuditResponse), permissions: access.permissions,
      nextCursor: records.length > query.limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: String(last._id) })).toString('base64url') : null,
    };
  }

  async change(player: any, id: string, raw: unknown) {
    const input = parse(purseChangeInput, raw);
    const hash = fingerprint({ actor: String(player._id), input });
    const dedupeKey = `purse:${input.requestId}`;
    const initial = await this.access(player, id);
    if (input.action === 'set_base_capacity' && !initial.owner) throw new ErrorUtil('Only the character owner can change base Purse capacity.', 403);
    const replay = (entry: any, access: Awaited<ReturnType<CharacterPurseHandler['access']>>) => {
      if (!entry) return null;
      if (!access.owner && String(entry.campaign) !== String(access.campaign?._id)) throw new ErrorUtil('That Purse change belongs to a different campaign.', 403);
      if (entry.fingerprint !== hash) throw new ErrorUtil('Request ID was already used for a different Purse change.', 409);
      return { snapshot: entry.after, revision: entry.revision, entry: purseAuditResponse(entry), permissions: access.permissions };
    };
    const previous = replay(await PurseAudit.findOne({ character: id, dedupeKey }).lean(), initial);
    if (previous) return previous;
    let result: any;
    try {
      result = await withPurseTransaction(async session => {
        const access = await this.access(player, id, session);
        if (input.action === 'set_base_capacity' && !access.owner) throw new ErrorUtil('Only the character owner can change base Purse capacity.', 403);
        const existing = replay(await PurseAudit.findOne({ character: id, dedupeKey }).session(session).lean(), access);
        if (existing) return existing;
        const character = access.character;
        if ((character.__v ?? 0) !== input.expectedRevision) throw purseConflict();
        const before = purseSnapshot(character);
        if (input.action === 'mark') {
          if (input.amount > before.available) throw new ErrorUtil('There are not enough available Purse boxes to mark that amount.', 400);
          character.sheet.purse!.marks += input.amount;
        } else if (input.action === 'clear') {
          if (input.amount > before.marks) throw new ErrorUtil('You cannot clear more Purse marks than are recorded.', 400);
          character.sheet.purse!.marks -= input.amount;
        } else if (input.action === 'clear_all') character.sheet.purse!.marks = 0;
        else {
          if (before.baseCapacity === input.baseCapacity) throw new ErrorUtil('Base Purse capacity is already set to that value.', 400);
          character.sheet.purse!.baseCapacity = input.baseCapacity;
        }
        const snapshot = purseSnapshot(character);
        await character.save({ session });
        const entry = await createPurseAudit(character, before, { actorId: String(player._id), actorName: player.displayName || 'Player', action: input.action, source: access.owner ? 'player' : 'storyweaver', note: input.note, requestId: input.requestId, dedupeKey, fingerprint: hash }, session);
        return { snapshot, revision: character.__v ?? 0, entry: purseAuditResponse(entry), permissions: access.permissions };
      }, true);
    } catch (error: any) {
      if (error?.name === 'VersionError' || error?.code === 11000 || error?.code === 112 || error?.hasErrorLabel?.('TransientTransactionError')) {
        const access = await this.access(player, id);
        const recorded = replay(await PurseAudit.findOne({ character: id, dedupeKey }).lean(), access);
        if (recorded) result = recorded;
        else throw purseConflict();
      } else throw error;
    }
    const current = await CharacterModel.findById(id).select('player campaign status').lean();
    if (current) await notifyPurseUpdated(current);
    return result;
  }
}

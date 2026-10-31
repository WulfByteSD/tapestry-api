import { Types } from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CharacterModel from '../../characters/model/CharacterModel';
import CombatantModel from '../../content/model/CombatantModel';
import { EncounterDraftModel } from '../models/EncounterDraft.model';
import { EncounterLibraryModel } from '../models/EncounterLibrary.model';
import { campaignAccess } from '../utils/access';
import { catalogSnapshot, CombatantSnapshot, displayCharacter, objectId, parse, Participant, TurnOrderCommand } from '../utils/contracts';
import { pagination, searchFilter } from './EncounterLibrary.handler';
import EncounterTurnOrderHandler from './EncounterTurnOrder.handler';
import { EncounterSceneModel } from '../models/EncounterScene.model';

const turns = new EncounterTurnOrderHandler();

function draftDTO(doc: any) {
  return {
    id: String(doc._id),
    campaignId: String(doc.campaign),
    title: doc.title,
    notes: doc.notes,
    status: doc.status ?? 'draft',
    revision: doc.revision,
    participants: doc.participants,
    turnOrder: turns.read(doc),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}
function checkRevision(actual: number, expected: number) {
  if (actual !== expected) throw new ErrorUtil('This encounter changed. Reload it before saving again.', 409);
}
export default class EncounterDraftHandler {
  async list(player: string, campaignId: string, query: { pageNumber: number; pageLimit: number; keyword?: string }) {
    await campaignAccess(player, campaignId);
    const filter = { campaign: campaignId, ...searchFilter('title', query.keyword) };
    const [docs, count] = await Promise.all([
      EncounterDraftModel.aggregate([
        { $match: { ...filter, campaign: new Types.ObjectId(campaignId) } },
        { $sort: { updatedAt: -1, _id: -1 } },
        { $skip: (query.pageNumber - 1) * query.pageLimit },
        { $limit: query.pageLimit },
        { $project: { title: 1, status: 1, campaign: 1, revision: 1, createdAt: 1, updatedAt: 1, participantCount: { $size: '$participants' } } },
      ]),
      EncounterDraftModel.countDocuments(filter),
    ]);
    return {
      payload: docs.map((doc) => ({
        id: String(doc._id),
        campaignId: String(doc.campaign),
        title: doc.title,
        status: doc.status ?? 'draft',
        revision: doc.revision,
        participantCount: doc.participantCount,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
      })),
      metadata: pagination(query.pageNumber, query.pageLimit, count),
    };
  }
  async get(player: string, campaignId: string, id: string) {
    await campaignAccess(player, campaignId);
    return draftDTO(await this.find(campaignId, id));
  }
  async create(player: string, campaignId: string, input: { title: string; notes?: string }) {
    await campaignAccess(player, campaignId, true);
    return draftDTO(await EncounterDraftModel.create({ campaign: campaignId, ...input }));
  }
  private async find(campaignId: string, id: string) {
    parse(objectId, id);
    const doc = await EncounterDraftModel.findOne({ _id: id, campaign: campaignId }).lean();
    if (!doc) throw new ErrorUtil('Encounter draft not found.', 404);
    return doc;
  }
  private eligibleFilter(campaign: any) {
    // A stale member character ID, a foreign owner's character, or a detached sheet is never eligible.
    const members = campaign.members.filter((member: any) => member.characters?.length);
    return {
      campaign: campaign._id,
      status: 'active',
      'meta.deletedAt': null,
      $or: members.length ? members.map((member: any) => ({ player: member.player, _id: { $in: member.characters } })) : [{ _id: { $in: [] } }],
    };
  }
  async characters(player: string, campaignId: string) {
    const campaign = await campaignAccess(player, campaignId);
    const docs = await CharacterModel.find(this.eligibleFilter(campaign)).select('name avatarUrl sheet.archetypeKey sheet.weaveLevel').sort({ name: 1, _id: 1 }).lean();
    return docs.map((doc) => ({ id: String(doc._id), snapshot: displayCharacter(doc) }));
  }
  private async save(player: string, campaignId: string, id: string, revision: number, changes: Record<string, unknown>) {
    if (Buffer.byteLength(JSON.stringify(changes)) > 2000000) throw new ErrorUtil('This encounter is too large. Shorten the preparation details.', 400);
    // Recheck membership/status after reading sources and before the atomic draft update.
    await campaignAccess(player, campaignId, true);
    const doc = await EncounterDraftModel.findOneAndUpdate(
      { _id: id, campaign: campaignId, revision },
      { $set: changes, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    if (!doc) throw new ErrorUtil('This encounter changed. Reload it before saving again.', 409);
    return draftDTO(doc);
  }
  async update(player: string, campaignId: string, id: string, input: { revision: number; title?: string; notes?: string }) {
    await campaignAccess(player, campaignId, true);
    await this.find(campaignId, id);
    const { revision, ...changes } = input;
    return this.save(player, campaignId, id, revision, changes);
  }
  async updateTurnOrder(player: string, campaignId: string, id: string, command: TurnOrderCommand) {
    await campaignAccess(player, campaignId, true);
    const draft = await this.find(campaignId, id);
    checkRevision(draft.revision, command.revision);
    const turnOrder = turns.execute(turns.read(draft as any), draft.participants as Participant[], command);
    return this.save(player, campaignId, id, command.revision, { turnOrder });
  }
  async add(player: string, campaignId: string, id: string, input: { revision: number; source: { kind: 'catalog' | 'personal' | 'character'; id: string } }) {
    const campaign = await campaignAccess(player, campaignId, true);
    const draft = await this.find(campaignId, id);
    checkRevision(draft.revision, input.revision);
    const items = draft.participants as Participant[];
    if (items.length >= 100) throw new ErrorUtil('An encounter can contain at most 100 participants.', 400);
    let entry: Participant;
    const source = input.source;
    const participantId = new Types.ObjectId().toHexString();
    if (source.kind === 'character') {
      if (items.some((item) => item.kind === 'character' && item.provenance.id === source.id)) throw new ErrorUtil('That character is already in this encounter.', 400);
      const character = await CharacterModel.findOne({ ...this.eligibleFilter(campaign), _id: source.id })
        .select('name avatarUrl sheet.archetypeKey sheet.weaveLevel')
        .lean();
      if (!character) throw new ErrorUtil('Character is not an active member character attached to this campaign.', 400);
      entry = { id: participantId, kind: 'character', provenance: { kind: 'character', id: source.id }, snapshot: displayCharacter(character) };
    } else {
      let snapshot: CombatantSnapshot;
      if (source.kind === 'personal') {
        const template = await EncounterLibraryModel.findOne({ _id: source.id, owner: player }).lean();
        if (!template) throw new ErrorUtil('Personal combatant not found.', 404);
        snapshot = template.snapshot as CombatantSnapshot;
      } else {
        const template = await CombatantModel.findOne({ _id: source.id, status: 'published' }).lean();
        if (!template) throw new ErrorUtil('Published combatant not found.', 404);
        snapshot = catalogSnapshot(template);
      }
      entry = { id: participantId, kind: 'combatant', provenance: { kind: source.kind, id: source.id }, snapshot: JSON.parse(JSON.stringify(snapshot)) };
    }
    return this.save(player, campaignId, id, input.revision, { participants: [...items, entry], turnOrder: turns.append(turns.read(draft as any), entry.id) });
  }
  async changeParticipant(
    player: string,
    campaignId: string,
    id: string,
    participantId: string,
    revision: number,
    action: 'edit' | 'remove' | 'duplicate',
    snapshot?: CombatantSnapshot
  ) {
    await campaignAccess(player, campaignId, true);
    parse(objectId, participantId);
    const draft = await this.find(campaignId, id);
    checkRevision(draft.revision, revision);
    const items = draft.participants as Participant[];
    const index = items.findIndex((item) => item.id === participantId);
    if (index < 0) throw new ErrorUtil('Participant not found.', 404);
    const item = items[index];
    if(action!=='duplicate'&&await EncounterSceneModel.exists({encounter:id,participantIds:participantId}))throw new ErrorUtil('This participant is referenced by a scene. Manage its scene cast before changing preparation.',409);
    let turnOrder = turns.read(draft as any);
    if (action !== 'remove' && item.kind === 'character') throw new ErrorUtil('Character references cannot be edited or duplicated.', 400);
    if (action === 'remove') {
      items.splice(index, 1);
      turnOrder = turns.remove(turnOrder, new Set(turnOrder.slots.filter((slot) => slot.participantId === participantId).map((slot) => slot.id)));
    }
    else if (action === 'duplicate') {
      if (items.length >= 100) throw new ErrorUtil('An encounter can contain at most 100 participants.', 400);
      items.push({ ...JSON.parse(JSON.stringify(item)), id: new Types.ObjectId().toHexString() });
      turnOrder = turns.append(turnOrder, items[items.length - 1].id);
    } else if (item.kind === 'combatant' && snapshot) items[index] = { ...item, snapshot };
    return this.save(player, campaignId, id, revision, { participants: items, turnOrder });
  }
}

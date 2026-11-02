import mongoose from 'mongoose';
import Lore from '../model/LoreNodeModel';
import Item from '../model/ItemDefinitionModel';
import Combatant from '../model/CombatantModel';
import Setting from '../model/SettingModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { ExplorerType, explorerSummary, readerRecord } from '../util/contentReader';

export const explorerModels: Record<ExplorerType, mongoose.Model<any>> = { lore: Lore, item: Item, combatant: Combatant };
export interface ExplorerQuery { q?: string; type?: ExplorerType; setting?: string; kind?: string; page: number; limit: number }
export const publicSearchFields: Record<ExplorerType, string[]> = {
  lore: ['name', 'meta.identity.aliases', 'summary', 'body', 'tags'],
  item: ['name', 'notes', 'tags'],
  combatant: ['name', 'notes.public', 'backgroundBehavior', 'whereFound', 'origin'],
};
export const escapeSearch = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default class ExplorerHandler {
  async list(query: ExplorerQuery) {
    const types: ExplorerType[] = query.type ? [query.type] : ['lore', 'item', 'combatant'];
    const q = query.q?.trim() || '';
    const stages = (type: ExplorerType): any[] => {
      const filter: any = { status: 'published' };
      if (query.setting) filter[type === 'lore' ? 'settingKey' : 'settingKeys'] = query.setting;
      if (query.kind) filter[type === 'lore' ? 'kind' : 'category'] = query.kind;
      if (q) filter.$or = publicSearchFields[type].map(field => ({ [field]: { $regex: escapeSearch(q), $options: 'i' } }));
      return [{ $match: filter }, { $project: {
        _id: 1, type: { $literal: type }, key: 1, name: 1,
        kind: type === 'lore' ? '$kind' : '$category',
        settingKeys: type === 'lore' ? ['$settingKey'] : '$settingKeys',
        description: type === 'combatant' ? { $cond: [{ $ne: [{ $ifNull: ['$notes.public', ''] }, ''] }, '$notes.public', { $ifNull: ['$backgroundBehavior', ''] }] } : { $ifNull: [type === 'lore' ? '$summary' : '$notes', ''] },
        imageUrl: type === 'item' ? '$imageUrl' : { $cond: [
          { $ne: [{ $ifNull: [type === 'lore' ? '$meta.media.portraitUrl' : '$media.portraitUrl', ''] }, ''] },
          type === 'lore' ? '$meta.media.portraitUrl' : '$media.portraitUrl',
          type === 'lore' ? '$meta.media.bannerUrl' : '$media.bannerUrl',
        ] },
        rank: q ? { $switch: { branches: [
          { case: { $eq: [{ $toLower: '$name' }, q.toLowerCase()] }, then: 0 },
          { case: { $regexMatch: { input: '$name', regex: '^' + escapeSearch(q), options: 'i' } }, then: 1 },
        ], default: 2 } } : { $literal: 0 },
      } }];
    };
    const pipeline: any[] = [...stages(types[0]), ...types.slice(1).map(type => ({ $unionWith: { coll: explorerModels[type].collection.name, pipeline: stages(type) } })),
      { $sort: { rank: 1, name: 1, type: 1, _id: 1 } },
      { $facet: { entries: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }], count: [{ $count: 'total' }] } }];
    const [result] = await explorerModels[types[0]].aggregate(pipeline);
    const totalCount = result.count[0]?.total || 0;
    return { payload: result.entries.map(({ _id, rank, ...entry }: any) => ({ ...entry, id: String(_id) })),
      metadata: { page: query.page, pages: Math.ceil(totalCount / query.limit), totalCount, prevPage: query.page - 1, nextPage: query.page + 1 } };
  }

  async filters() {
    const [settings, lore, item, combatant] = await Promise.all([
      Setting.find({ status: 'published' }).select('key name').sort({ name: 1 }).lean(),
      Lore.distinct('kind', { status: 'published' }), Item.distinct('category', { status: 'published' }), Combatant.distinct('category', { status: 'published' }),
    ]);
    return { settings: settings.map(s => ({ key: s.key, name: s.name })), kinds: { lore: lore.sort(), item: item.sort(), combatant: combatant.sort() } };
  }

  async published(type: ExplorerType, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new ErrorUtil('Invalid content id.', 400);
    const doc = await explorerModels[type].findOne({ _id: id, status: 'published' }).lean();
    if (!doc) throw new ErrorUtil('This entry is unavailable.', 404);
    return doc;
  }

  /** Redact dangling/unpublished references before returning either modern or legacy records. */
  async record(type: ExplorerType, doc: any, privileged: boolean) {
    const record = readerRecord(type, doc, privileged);
    if (type === 'lore') {
      const ids = [doc.parentId, ...(doc.ancestorIds || []), ...(doc.relations || []).map((r: any) => r.targetId)].filter(Boolean);
      const targets = await Lore.find({ _id: { $in: ids }, status: 'published' }).select('_id key name kind status').lean();
      const map = new Map(targets.map(target => [String(target._id), target]));
      record.parentId = map.has(String(doc.parentId)) ? doc.parentId : null;
      record.ancestorIds = (doc.ancestorIds || []).filter((id: any) => map.has(String(id)));
      record.relations = record.relations.filter((r: any) => map.has(String(r.targetId))).map((r: any) => ({ ...r, target: map.get(String(r.targetId)) }));
      const links = await Promise.all((doc.linkedContent || []).map(async (ref: any) => {
        if (!['item', 'combatant'].includes(ref.type)) return null;
        return await explorerModels[ref.type as ExplorerType].exists({ _id: ref.targetId, status: 'published' }) ? ref : null;
      }));
      record.linkedContent = links.filter(Boolean);
    } else if (type === 'combatant' && doc.loreNodeId && !(await Lore.exists({ _id: doc.loreNodeId, status: 'published' }))) record.loreNodeId = null;
    if (type === 'item' && record.grantedAbilities?.length) {
      const { default: AbilityDefinitionModel } = await import('../model/AbilityDefinitionModel');
      const ids = await AbilityDefinitionModel.find({ _id: { $in: record.grantedAbilities.map((ref: any) => ref.abilityId) }, status: 'published' }).select('_id').lean();
      const allowed = new Set(ids.map(entry => String(entry._id)));
      record.grantedAbilities = record.grantedAbilities.filter((ref: any) => allowed.has(String(ref.abilityId)));
    }
    return record;
  }

  async detail(type: ExplorerType, id: string, privileged: boolean) {
    const doc: any = await this.published(type, id);
    const record = await this.record(type, doc, privileged);
    const related: any = { lineage: [], children: [], lore: [], items: [], combatants: [], relations: [] };
    if (type === 'lore') {
      const [lineage, children, incoming, items, combatants] = await Promise.all([
        Lore.find({ _id: { $in: record.ancestorIds }, status: 'published' }).lean(),
        Lore.find({ parentId: id, status: 'published' }).sort({ sortOrder: 1, name: 1 }).lean(),
        Lore.find({ 'relations.targetId': id, status: 'published' }).sort({ name: 1 }).lean(),
        Item.find({ _id: { $in: record.linkedContent.filter((r: any) => r.type === 'item').map((r: any) => r.targetId) }, status: 'published' }).sort({ name: 1 }).lean(),
        Combatant.find({ status: 'published', $or: [{ loreNodeId: id }, { _id: { $in: record.linkedContent.filter((r: any) => r.type === 'combatant').map((r: any) => r.targetId) } }] }).sort({ name: 1 }).lean(),
      ]);
      const ancestors = new Map(lineage.map(n => [String(n._id), n]));
      related.lineage = record.ancestorIds.map((ancestorId: any) => ancestors.get(String(ancestorId))).filter(Boolean).map((n: any) => explorerSummary('lore', n));
      related.children = children.map(n => explorerSummary('lore', n));
      related.items = items.map(n => explorerSummary('item', n));
      related.combatants = combatants.map((n: any) => explorerSummary('combatant', n));
      const focus = explorerSummary('lore', doc);
      related.relations = [
        ...record.relations.map((r: any) => ({ type: r.type, label: r.label, ...(privileged ? { notes: r.notes } : {}), source: focus, target: explorerSummary('lore', { ...r.target, settingKey: doc.settingKey }) })),
        ...incoming.flatMap(n => n.relations.filter(r => String(r.targetId) === id && String(n._id) !== id).map(r => ({ type: r.type, label: r.label, ...(privileged ? { notes: r.notes } : {}), source: explorerSummary('lore', n), target: focus }))),
      ];
    } else {
      const conditions: any[] = [{ linkedContent: { $elemMatch: { type, targetId: new mongoose.Types.ObjectId(id) } } }];
      if (type === 'combatant' && record.loreNodeId) conditions.push({ _id: record.loreNodeId });
      related.lore = (await Lore.find({ status: 'published', $or: conditions }).sort({ name: 1 }).lean()).map(n => explorerSummary('lore', n));
    }
    const settingKeys = type === 'lore' ? [doc.settingKey] : doc.settingKeys;
    const settings = await Setting.find({ key: { $in: settingKeys || [] }, status: 'published' }).select('key name').lean();
    return { ...explorerSummary(type, doc), record, related, settings: settings.map(s => ({ key: s.key, name: s.name })), privileged };
  }
}

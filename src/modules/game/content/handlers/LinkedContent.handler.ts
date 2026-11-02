import mongoose from 'mongoose';
import CombatantModel from '../model/CombatantModel';
import ItemDefinitionModel from '../model/ItemDefinitionModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { escapeSearch } from './Explorer.handler';

export default class LinkedContentHandler {
  constructor() {}

  async searchLinkedOptions(params: { type?: string; settingKey?: string; query?: string; limit?: number }) {
    const { type = 'combatant', settingKey, query = '', limit = 8 } = params;
    if (!['item', 'combatant'].includes(type)) throw new ErrorUtil('Unsupported linked content type.', 400);
    const model: mongoose.Model<any> = type === 'item' ? ItemDefinitionModel : CombatantModel;

    const filters: any = {
      status: { $ne: 'archived' },
    };

    if (settingKey) {
      filters.settingKeys = { $in: type === 'item' ? [settingKey, 'shared'] : [settingKey] };
    }

    const q = query.trim();
    const safeLimit = Math.max(1, Math.min(limit, 12));

    if (q.length >= 2) {
      filters.$or = (type === 'item' ? ['name', 'key', 'tags'] : ['name', 'key', 'role', 'origin', 'statline.tags'])
        .map(field => ({ [field]: { $regex: escapeSearch(q), $options: 'i' } }));
    }

    const docs = await model.find(filters)
      .sort(q.length >= 2 ? { name: 1 } : { updatedAt: -1, name: 1 })
      .limit(safeLimit)
      .lean();

    return docs.map((doc: any) => ({
      id: String(doc._id),
      type,
      key: doc.key,
      name: doc.name,
      subtitle: [doc.category, doc.role].filter(Boolean).join(' • '),
      meta: [doc.disposition, ...(doc.settingKeys || [])].filter(Boolean).join(' • '),
    }));
  }
}

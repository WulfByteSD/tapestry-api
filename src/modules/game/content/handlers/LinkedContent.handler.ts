import { CRUDHandler } from '../../../../utils/baseCRUD';
import CombatantModel from '../model/CombatantModel';

export default class LinkedContentHandler {
  constructor() {}

  async searchLinkedOptions(params: { settingKey?: string; query?: string; limit?: number }) {
    const { settingKey, query = '', limit = 8 } = params;

    const filters: any = {
      status: { $ne: 'archived' },
    };

    if (settingKey) {
      filters.settingKeys = { $in: [settingKey] };
    }

    const q = query.trim();
    const safeLimit = Math.max(1, Math.min(limit, 12));

    if (q.length >= 2) {
      filters.$or = [
        { name: { $regex: q, $options: 'i' } },
        { key: { $regex: q, $options: 'i' } },
        { role: { $regex: q, $options: 'i' } },
        { origin: { $regex: q, $options: 'i' } },
        { 'statline.tags': { $regex: q, $options: 'i' } },
      ];
    }

    const docs = await CombatantModel.find(filters)
      .sort(q.length >= 2 ? { name: 1 } : { updatedAt: -1, name: 1 })
      .limit(safeLimit)
      .lean();

    console.log('Search Linked Options - Filters:', filters, 'Query:', q, 'Results Found:', docs.length);
    return docs.map((doc: any) => ({
      id: String(doc._id),
      type: 'combatant',
      key: doc.key,
      name: doc.name,
      subtitle: [doc.category, doc.role].filter(Boolean).join(' • '),
      meta: [doc.disposition, ...(doc.settingKeys || [])].filter(Boolean).join(' • '),
    }));
  }
}

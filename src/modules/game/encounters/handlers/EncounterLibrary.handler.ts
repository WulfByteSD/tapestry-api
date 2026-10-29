import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CombatantModel from '../../content/model/CombatantModel';
import { EncounterLibraryModel } from '../models/EncounterLibrary.model';
import { catalogSnapshot, CombatantSnapshot, objectId, parse } from '../utils/contracts';

export function libraryDTO(doc: any) {
  return {
    id: String(doc._id),
    revision: doc.revision,
    snapshot: doc.snapshot,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}
export function pagination(pageNumber: number, pageLimit: number, totalCount: number) {
  return { page: pageNumber, pages: Math.ceil(totalCount / pageLimit), totalCount, prevPage: pageNumber - 1, nextPage: pageNumber + 1 };
}
export function searchFilter(field: string, keyword?: string) {
  return keyword ? { [field]: { $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
}
export default class EncounterLibraryHandler {
  async list(owner: string, query: { pageNumber: number; pageLimit: number; keyword?: string }, catalog = false) {
    const model = catalog ? CombatantModel : EncounterLibraryModel;
    const filter = { ...(catalog ? { status: 'published' } : { owner }), ...searchFilter(catalog ? 'name' : 'snapshot.name', query.keyword) } as any;
    const [docs, count] = await Promise.all([
      model
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((query.pageNumber - 1) * query.pageLimit)
        .limit(query.pageLimit)
        .lean(),
      model.countDocuments(filter),
    ]);
    return {
      payload: docs.map((doc: any) => (catalog ? { id: String(doc._id), snapshot: catalogSnapshot(doc) } : libraryDTO(doc))),
      metadata: pagination(query.pageNumber, query.pageLimit, count),
    };
  }
  async get(owner: string, id: string) {
    parse(objectId, id);
    const doc = await EncounterLibraryModel.findOne({ _id: id, owner }).lean();
    if (!doc) throw new ErrorUtil('Personal combatant not found.', 404);
    return libraryDTO(doc);
  }
  async create(owner: string, snapshot: CombatantSnapshot) {
    return libraryDTO(await EncounterLibraryModel.create({ owner, snapshot }));
  }
  async update(owner: string, id: string, revision: number, snapshot: CombatantSnapshot) {
    await this.get(owner, id);
    const doc = await EncounterLibraryModel.findOneAndUpdate(
      { _id: id, owner, revision },
      { $set: { snapshot }, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    if (!doc) throw new ErrorUtil('This personal combatant changed. Reload it before saving again.', 409);
    return libraryDTO(doc);
  }
}

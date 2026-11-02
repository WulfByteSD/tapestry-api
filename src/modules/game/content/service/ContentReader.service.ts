import { Request, Response, NextFunction, RequestHandler } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { AdvFilters } from '../../../../utils/advFilter/AdvFilters';
import ExplorerHandler, { escapeSearch, explorerModels, publicSearchFields } from '../handlers/Explorer.handler';
import LoreTreeHandler from '../handlers/LoreTree.handler';
import { contentReader } from '../util/contentReader';

/** Keep authoring reads intact; ordinary catalogue reads use the same policy as Explorer. */
export function legacyContentReader(type: 'lore' | 'combatant'): RequestHandler {
  const handler = new ExplorerHandler();
  const tree = new LoreTreeHandler(true);
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    res.setHeader('Cache-Control', 'private, no-store');
    const reader = await contentReader(req as AuthenticatedRequest);
    if (reader.admin) return next();
    const parts = req.path.split('/').filter(Boolean).map(decodeURIComponent);
    const clean = async (value: any): Promise<any> => {
      if (Array.isArray(value)) return Promise.all(value.map(clean));
      if (!value || typeof value !== 'object') return value;
      if (value._id && value.status) {
        if (value.status !== 'published') return null;
        const record = await handler.record(type, value, reader.privileged);
        for (const key of ['children', 'parent', 'ancestors']) if (value[key] !== undefined) record[key] = await clean(value[key]);
        for (const key of ['childCount', 'hasChildren', 'isRoot', 'isFocus', 'isLineage']) if (value[key] !== undefined) record[key] = value[key];
        return record;
      }
      return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await clean(item)])));
    };
    let result: any;
    if (!parts.length) {
      const page = Number(req.query.pageNumber || 1), limit = Number(req.query.pageLimit || 24);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ErrorUtil('Invalid pagination.', 400);
      const allowed = new Set(['_id', 'key', 'name', 'status', 'kind', 'category', 'settingKey', 'settingKeys', 'tags', 'parentId']);
      const filters = AdvFilters.filter(typeof req.query.filterOptions === 'string' ? req.query.filterOptions : '');
      for (const filter of filters) for (const [key, value] of Object.entries(filter)) {
        if (!allowed.has(key) || (value && typeof value === 'object' && !(value instanceof Date) && !('_bsontype' in value) && Object.keys(value).some(op => !['$in', '$eq', '$ne'].includes(op)))) throw new ErrorUtil('Unsupported reader filter.', 400);
      }
      // Arbitrary include/sort expressions must not become a side channel for private fields.
      if (req.query.includeOptions) throw new ErrorUtil('Include filters are not available for catalogue readers.', 400);
      const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim().slice(0, 200) : '';
      const filter: any = { $and: [{ status: 'published' }, ...filters] };
      if (keyword) filter.$or = publicSearchFields[type].map(field => ({ [field]: { $regex: escapeSearch(keyword), $options: 'i' } }));
      const requestedSort = AdvFilters.sort(typeof req.query.sortOptions === 'string' ? req.query.sortOptions : 'name');
      if (Object.keys(requestedSort).some(key => !['name', 'key', 'createdAt', 'updatedAt', 'sortOrder', '_id'].includes(key))) throw new ErrorUtil('Unsupported reader sort.', 400);
      const [docs, totalCount] = await Promise.all([
        explorerModels[type].find(filter).sort({ ...requestedSort, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        explorerModels[type].countDocuments(filter),
      ]);
      return res.json({ success: true, payload: await clean(docs), metadata: { page, pages: Math.ceil(totalCount / limit), totalCount, prevPage: page - 1, nextPage: page + 1 } });
    }
    if (type === 'lore' && parts[0] === 'tree' && parts.length === 2) result = await tree.fetchTreeForSetting(parts[1]);
    else if (type === 'lore' && parts[0] === 'children' && parts.length === 2) {
      await handler.published('lore', parts[1]);
      result = await tree.fetchChildrenForNode(parts[1]);
    } else if (type === 'lore' && parts[0] === 'context' && parts.length === 2) {
      const depth = Number(req.query.descendantDepth || 2);
      if (!Number.isInteger(depth) || depth < 1 || depth > 3) throw new ErrorUtil('Invalid descendant depth.', 400);
      result = await tree.fetchFocusedContext(parts[1], depth);
    } else if (type === 'lore' && parts[0] === 'by-key' && parts.length === 3) result = await tree.fetchBySettingAndKey(parts[1], parts[2]);
    else if (parts.length === 1 && parts[0] !== 'origins') result = await handler.published(type, parts[0]);
    else throw new ErrorUtil('This entry is unavailable.', 404);
    if (!result) throw new ErrorUtil('This entry is unavailable.', 404);
    return res.json({ success: true, payload: await clean(result) });
  });
}

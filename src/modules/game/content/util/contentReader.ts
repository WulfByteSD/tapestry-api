import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import Player from '../../../profiles/player/model/PlayerModel';
import Admin from '../../../profiles/admin/model/AdminModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import asyncHandler from '../../../../middleware/asyncHandler';

export interface ContentReader { admin: boolean; privileged: boolean }

/** Resolve persisted roles, independently of the requested service/header. */
export async function contentReader(req: AuthenticatedRequest): Promise<ContentReader> {
  if (!req.user?._id) throw new ErrorUtil('An account is required.', 403);
  const [player, administrator] = await Promise.all([
    Player.findOne().where('user').equals(req.user._id).select('roles').lean(),
    Admin.findOne().where('user').equals(req.user._id).select('roles permissions').lean(),
  ]);
  const admin = !!administrator && [...(administrator.roles || []), ...(administrator.permissions || [])].includes('admin');
  return { admin, privileged: admin || !!player?.roles?.includes('storyweaver') };
}

export const requireContentAdmin: RequestHandler = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await contentReader(req as AuthenticatedRequest)).admin) throw new ErrorUtil('Administrator access is required.', 403);
  next();
});

export const requireContentStoryweaver: RequestHandler = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await contentReader(req as AuthenticatedRequest)).privileged) throw new ErrorUtil('Storyweaver access is required.', 403);
  next();
});

export type ExplorerType = 'lore' | 'item' | 'combatant';
const pick = (doc: any, fields: string[]) => Object.fromEntries(fields.filter(key => doc[key] !== undefined).map(key => [key, doc[key]]));

/** Explicit public fields prevent new authoring fields from becoming public by accident. */
export function readerRecord(type: ExplorerType, doc: any, privileged: boolean): any {
  const common = pick(doc, ['_id', 'key', 'name', 'status', 'createdAt', 'updatedAt']);
  if (type === 'item') return { ...common, ...pick(doc, ['settingKeys', 'category', 'imageUrl', 'tags', 'notes', 'equippable', 'slot', 'stackable', 'protection', 'attackProfiles', 'grantedAbilities']) };
  if (type === 'combatant') return {
    ...common, ...pick(doc, ['settingKeys', 'category', 'disposition', 'origin', 'origins', 'role', 'backgroundBehavior', 'whereFound', 'media', 'loreNodeId']),
    notes: privileged ? doc.notes : { public: doc.notes?.public || '' },
    ...(privileged ? pick(doc, ['tier', 'perks', 'statline', 'attacks', 'abilities', 'loreCheck', 'tactics', 'hooks']) : {}),
  };
  return {
    ...common, ...pick(doc, ['settingKey', 'kind', 'parentId', 'ancestorIds', 'depth', 'sortOrder', 'tags', 'summary', 'body', 'linkedContent']),
    relations: (doc.relations || []).map((rel: any) => privileged ? rel : pick(rel, ['type', 'targetId', 'targetKey', 'label', 'target'])),
    meta: {
      ...pick(doc.meta || {}, ['media', 'identity', 'classification', 'world']),
      story: pick(doc.meta?.story || {}, privileged ? ['hooks', 'rumors', 'secrets', 'quotes', 'gmNotes'] : ['rumors', 'quotes']),
    },
  };
}

export function explorerSummary(type: ExplorerType, doc: any) {
  return {
    id: String(doc._id), type, key: doc.key, name: doc.name,
    kind: type === 'lore' ? doc.kind : doc.category,
    settingKeys: type === 'lore' ? [doc.settingKey] : doc.settingKeys || [],
    description: type === 'lore' ? doc.summary || '' : type === 'item' ? doc.notes || '' : doc.notes?.public || doc.backgroundBehavior || '',
    imageUrl: type === 'lore' ? doc.meta?.media?.portraitUrl || doc.meta?.media?.bannerUrl : type === 'item' ? doc.imageUrl : doc.media?.portraitUrl || doc.media?.bannerUrl,
  };
}

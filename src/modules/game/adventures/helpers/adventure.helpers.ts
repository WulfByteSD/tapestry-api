import { z } from 'zod';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { AdventureRecord } from '../models/AdventureModel';
import { AdventureActor, StoredMaterial } from '../types/adventure.contracts';
export function requireAdmin(actor: AdventureActor) {
  if (!actor.permissions.includes('admin')) throw new ErrorUtil('Administrator permission required', 403);
}
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ErrorUtil(result.error.issues.map((issue) => issue.message).join('; '), 400);
  return result.data;
}
export const activeGrant = () => ({ status: 'active', permissions: 'view', $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
export const unavailable = () => new ErrorUtil('Adventure resource not available', 404);

/** Allowlist shared fields: no association lists, private notes, storage keys, or upstream URLs. */
export function materialView(material: StoredMaterial) {
  return {
    id: material.id,
    title: material.title,
    kind: material.kind,
    text: material.text,
    tags: material.tags,
    hasAsset: Boolean(material.asset),
    ...(material.asset ? { asset: { contentType: material.asset.contentType, bytes: material.asset.bytes } } : {}),
  };
}
export function adventureView(adventure: AdventureRecord & { _id: unknown }) {
  return {
    id: String(adventure._id),
    libraryResourceId: adventure.libraryResourceId,
    title: adventure.title,
    summary: adventure.summary,
    status: adventure.status,
    revision: adventure.revision,
    sections: adventure.sections,
    encounters: adventure.encounters,
    resources: adventure.resources.map((resource) => ({ ...materialView(resource), visibility: resource.visibility })),
  };
}


export function publishedContent(adventure: AdventureRecord & { _id: unknown }) {
  if (adventure.status !== 'published' || !adventure.publishedContent) throw unavailable();
  return { _id: adventure._id, libraryResourceId: adventure.libraryResourceId, status: adventure.status,
    revision: adventure.publishedRevision!, publishedAt: adventure.publishedAt, ...adventure.publishedContent };
}

import { Actor, ContentType, Capability } from '../types/McpTypes';
import { McpError } from './McpError';

/** Require every requested capability; broad roles never implicitly grant agent access. */
export function requireCapability(actor: Actor, ...caps: Capability[]) {
  if (!caps.every((c) => actor.capabilities.includes(c))) throw new McpError('forbidden', `Required capabilities: ${caps.join(', ')}.`, 403);
}
/** Resolve setting membership using each content model's native field names. */
export function recordSettings(type: ContentType, doc: any): string[] {
  if (type === 'settings') return [doc.key];
  if (type === 'lore') return [doc.settingKey];
  return Array.isArray(doc.settingKeys) ? doc.settingKeys : [];
}
/** Check content type, every attached setting, shared-content access, and optional publication visibility. */
export function canAccess(actor: Actor, type: ContentType, doc: any, readStatus = true): boolean {
  if (!actor.contentTypes.includes(type)) return false;
  const settings = recordSettings(type, doc);
  if (!settings.every((k) => (k === 'shared' ? actor.shared : actor.settingKeys.includes(k)))) return false;
  if (!settings.length && !actor.shared) return false;
  return (
    !readStatus ||
    doc.status === 'published' ||
    (doc.status === 'draft' && actor.capabilities.includes('read:draft')) ||
    (doc.status === 'archived' && actor.capabilities.includes('read:archived'))
  );
}
/** Reject content outside the grant before any read, proposal, or write is performed. */
export function assertAccess(actor: Actor, type: ContentType, doc: any, readStatus = true) {
  if (!canAccess(actor, type, doc, readStatus)) throw new McpError('forbidden', "The content is outside this connection's grant.", 403);
}
/** Build a MongoDB filter that excludes mixed-setting records when any setting is unauthorized. */
export function visibility(actor: Actor, type: ContentType): Record<string, any> {
  const keys = [...actor.settingKeys, ...(actor.shared ? ['shared'] : [])];
  const statuses = ['published', ...(actor.capabilities.includes('read:draft') ? ['draft'] : []), ...(actor.capabilities.includes('read:archived') ? ['archived'] : [])];
  if (!actor.contentTypes.includes(type)) return { _id: { $in: [] } };
  const membership =
    type === 'settings'
      ? { key: { $in: keys } }
      : type === 'lore'
        ? { settingKey: { $in: keys } }
        : { settingKeys: { $not: { $elemMatch: { $nin: keys } } }, ...(actor.shared ? {} : { 'settingKeys.0': { $exists: true } }) };
  return { ...membership, status: { $in: statuses } };
}

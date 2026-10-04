import { ClientSession } from 'mongoose';
import normalizeItem from '../../util/normalizeCreateInput';
import loreHierarchy from '../../service/LoreHierarchyService';
import { resolveLoreRelations } from '../../util/resolveLoreRelations';
import { Actor, ContentType, Operation } from '../types/McpTypes';
import { McpError } from '../util/McpError';
import { assertAccess, requireCapability, visibility } from '../util/mcpPolicy';
import { revision } from '../util/mcpCredentials';
import { contentModels } from '../util/contentRegistry';
import { parseOperation, rejectUnsafeKeys, excluded } from '../util/contentContracts';

/** Require referenced content to exist inside the caller's current readable grant. */
async function reference(actor: Actor, type: ContentType, query: any, session?: ClientSession): Promise<any> {
  const found = await contentModels[type]
    .findOne({ ...query, ...visibility(actor, type) })
    .session(session || null)
    .lean();
  if (!found) throw new McpError('validation', 'A referenced record does not exist or is outside the readable grant.');
  return found;
}
/** Validate existing settings, skills, abilities, lore, and combatant links without implicitly creating them. */
async function checkReferences(actor: Actor, type: ContentType, doc: any, session?: ClientSession) {
  if (type !== 'settings') {
    const keys: string[] = type === 'lore' ? [doc.settingKey] : doc.settingKeys;
    for (const key of keys || []) {
      if (key === 'shared') continue;
      await reference(actor, 'settings', { key }, session);
    }
  }
  for (const key of [...(doc.allowedSkillKeys || []), ...(doc.attackProfiles || []).flatMap((p: any) => p.allowedSkillKeys || [])])
    await reference(actor, 'skills', { key }, session);
  for (const ref of doc.grantedAbilities || []) await reference(actor, 'abilities', { _id: ref.abilityId, key: ref.abilityKey }, session);
  if (doc.loreNodeId) await reference(actor, 'lore', { _id: doc.loreNodeId }, session);
  if (type === 'lore') {
    if (doc.parentId) await reference(actor, 'lore', { _id: doc.parentId, settingKey: doc.settingKey }, session);
    for (const id of doc.ancestorIds || []) await reference(actor, 'lore', { _id: id, settingKey: doc.settingKey }, session);
    for (const rel of doc.relations || []) await reference(actor, 'lore', { _id: rel.targetId, key: rel.targetKey, settingKey: doc.settingKey }, session);
    for (const linked of doc.linkedContent || []) {
      if (linked.type !== 'combatant') throw new McpError('validation', 'Only combatant links are supported.');
      await reference(actor, 'combatants', { _id: linked.targetId }, session);
    }
  }
}
/** Merge object patches while treating arrays and null as replacement values, preserving untouched nested fields. */
function mergePatch(before: any, patch: any): any {
  const result = { ...before };
  for (const [key, value] of Object.entries(patch))
    result[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergePatch(before?.[key], value) : value;
  return result;
}
/** Validate and normalize a proposed or direct operation without writing. Recheck revisions and references at application time. */
export async function prepare(actor: Actor, raw: Operation, proposal = false, session?: ClientSession) {
  rejectUnsafeKeys(raw);
  const operation = parseOperation(raw);
  requireCapability(actor, 'read', proposal ? 'propose' : operation.action);
  if (!actor.contentTypes.includes(operation.type)) throw new McpError('forbidden', 'This content type is not granted.', 403);
  const Model = contentModels[operation.type];
  const before: any =
    operation.action === 'update'
      ? await Model.findById(operation.id)
          .session(session || null)
          .lean()
      : null;
  if (operation.action === 'update') {
    if (!before) throw new McpError('not_found', 'Content not found.', 404);
    assertAccess(actor, operation.type, before);
    if (before.status === 'archived') throw new McpError('validation', 'Archived records cannot be updated through MCP.');
    if (revision(before) !== operation.revision) throw new McpError('conflict', 'Content changed; read it again before updating.', 409);
  }
  let data = { ...operation.data };
  if (operation.action === 'create') {
    data.status ||= 'draft';
    if (operation.type === 'items') {
      // Scope is a virtual REST input, so persist its shared boundary using the library's existing setting marker.
      if (data.scope === 'shared') {
        if (!actor.shared) throw new McpError('forbidden', 'Shared content requires explicit permission.', 403);
        data.settingKeys = [...new Set([...(data.settingKeys || []), 'shared'])];
      }
      data = normalizeItem(data);
      delete data.scope;
    }
  }
  if (operation.type === 'lore') {
    if (before && data.settingKey && data.settingKey !== before.settingKey) throw new McpError('validation', 'Moving lore between settings requires a separate migration.');
    const settingKey = data.settingKey || before?.settingKey;
    // Only recalculate hierarchy when actually creating/moving a node. Missing parentId on a patch must preserve its parent.
    if (!before || Object.prototype.hasOwnProperty.call(data, 'parentId'))
      await loreHierarchy.applyHierarchyFields(data, { currentNodeId: operation.id, fallbackSettingKey: settingKey, session });
    if (Object.prototype.hasOwnProperty.call(data, 'relations'))
      data.relations = await resolveLoreRelations({ settingKey, relations: data.relations, currentNodeId: operation.id, session });
  }
  const merged = mergePatch(before, data);
  assertAccess(actor, operation.type, merged, false);
  if (!proposal && (before?.status === 'published' || merged.status === 'published')) requireCapability(actor, 'publish');
  const validated = new Model(merged);
  await validated.validate();
  const after = validated.toObject();
  assertAccess(actor, operation.type, after, false);
  await checkReferences(actor, operation.type, after, session);
  // Mongoose setters normalize keys and nested fields before duplicate checks and proposal storage.
  const lookup =
    operation.type === 'lore'
      ? { key: after.key, settingKey: after.settingKey }
      : operation.type === 'combatants'
        ? { key: after.key, settingKeys: { $in: after.settingKeys?.length ? after.settingKeys : [null] } }
        : { key: after.key };
  if (!before && (await Model.exists(lookup).session(session || null))) throw new McpError('duplicate', 'A record with this key already exists.', 409);
  const changes: Record<string, any> = {};
  for (const key of Object.keys(data)) changes[key] = after[key];
  // Preserve virtual authoring scope for proposal approval, including multi-setting shared item creations.
  if (operation.type === 'items' && operation.action === 'create') changes.scope = operation.data.scope || 'setting';
  // Store caller-editable normalization only; computed hierarchy is recalculated when applied.
  const clean = (value: any): any => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !['_id', '__v'].includes(key)).map(([key, child]) => [key, clean(child)])) : value;
  const proposalData = clean(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(changes).filter(([key]) => !excluded.has(key))))));
  return { operation: { ...operation, data: proposalData }, before, after };
}

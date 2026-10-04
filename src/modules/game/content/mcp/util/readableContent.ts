import { Actor, ContentType } from '../types/McpTypes';
import { assertAccess, visibility } from './mcpPolicy';
import { revision } from './mcpCredentials';
import { contentModels } from './contentRegistry';
import { SkillDefinitionModel } from '../../model/SkillDefinition';

/** Return a revision of the original record while removing references to content the caller cannot read. */
export async function readableRecord(actor: Actor, type: ContentType, doc: any): Promise<any> {
  assertAccess(actor, type, doc);
  return { record: await redactReferences(actor, type, doc), revision: revision(doc) };
}

/** Filter relationships in records and proposal patches against the caller's current readable grant. */
export async function redactReferences(actor: Actor, type: ContentType, doc: any): Promise<any> {
  const result = JSON.parse(JSON.stringify(doc));
  const visibleIds = async (target: ContentType, ids: string[]) =>
    new Set(
      (
        await contentModels[target]
          .find({ _id: { $in: ids }, ...visibility(actor, target) })
          .select('_id')
          .lean()
      ).map((d: any) => String(d._id))
    );
  const visibleSkills = async (keys: string[]) =>
    new Set(
      (
        await SkillDefinitionModel.find({ key: { $in: keys }, ...visibility(actor, 'skills') })
          .select('key')
          .lean()
      ).map((d: any) => d.key)
    );
  if (type === 'lore') {
    const ids = [result.parentId, ...(result.ancestorIds || []), ...(result.relations || []).map((r: any) => r.targetId)].filter(Boolean);
    const allowed = await visibleIds('lore', ids);
    if ('parentId' in result) result.parentId = allowed.has(result.parentId) ? result.parentId : null;
    if ('ancestorIds' in result) result.ancestorIds = (result.ancestorIds || []).filter((id: string) => allowed.has(id));
    if ('relations' in result) result.relations = (result.relations || []).filter((r: any) => allowed.has(r.targetId));
    const combatants = await visibleIds(
      'combatants',
      (result.linkedContent || []).filter((r: any) => r.type === 'combatant').map((r: any) => r.targetId)
    );
    if ('linkedContent' in result) result.linkedContent = (result.linkedContent || []).filter((r: any) => r.type === 'combatant' && combatants.has(r.targetId));
  }
  if (type === 'combatants' && result.loreNodeId && !(await visibleIds('lore', [result.loreNodeId])).has(result.loreNodeId)) result.loreNodeId = null;
  if (result.grantedAbilities?.length) {
    const allowed = await visibleIds(
      'abilities',
      result.grantedAbilities.map((r: any) => r.abilityId)
    );
    result.grantedAbilities = result.grantedAbilities.filter((r: any) => allowed.has(r.abilityId));
  }
  if (result.allowedSkillKeys?.length || result.attackProfiles?.some((p: any) => p.allowedSkillKeys?.length)) {
    const allowed = await visibleSkills([...(result.allowedSkillKeys || []), ...(result.attackProfiles || []).flatMap((p: any) => p.allowedSkillKeys || [])]);
    if (result.allowedSkillKeys) result.allowedSkillKeys = result.allowedSkillKeys.filter((key: string) => allowed.has(key));
    for (const profile of result.attackProfiles || []) profile.allowedSkillKeys = (profile.allowedSkillKeys || []).filter((key: string) => allowed.has(key));
  }
  return result;
}

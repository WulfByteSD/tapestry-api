import { ClientSession } from 'mongoose';
import Resource from '../../../../library/models/Resource';
import { Adventure } from '../../../adventures/models/AdventureModel';
import { contentInput, AdventureContent } from '../../../adventures/types/adventure.contracts';
import Combatant from '../../model/CombatantModel';
import { Actor, Operation } from '../types/McpTypes';
import { McpError } from '../util/McpError';
import { assertAccess, requireCapability, visibility } from '../util/mcpPolicy';

/** Prepare adventure snapshots inside the MCP transaction, retaining the domain's authoring invariants. */
export async function prepareAdventure(actor: Actor, operation: Operation, before: any, proposal: boolean, session?: ClientSession) {
  const data = operation.data;
  const libraryResourceId = before?.libraryResourceId || data.libraryResourceId.toLowerCase();
  const status = data.status || before?.status || 'draft';
  assertAccess(actor, 'adventures', { status }, false);
  // A published record can have an unpublished working draft. Require visibility of that draft before replacing it.
  if (before) requireCapability(actor, 'read:draft');
  if (!proposal && (before?.status === 'published' || status === 'published')) requireCapability(actor, 'publish');

  const publishing = data.status === 'published';
  const library = await Resource.findOne({ _id: libraryResourceId, kind: 'module', accessPolicy: 'entitlement',
    ...(publishing ? { status: 'published' } : {}) }).session(session || null).lean();
  if (!library) throw new McpError('validation', 'An entitlement-protected module library resource is required (published when publishing).');
  if (!before && await Adventure.exists({ libraryResourceId }).session(session || null))
    throw new McpError('duplicate', 'An adventure already exists for this library resource.', 409);

  const content = contentInput.parse(data.content || {
    title: before.title, summary: before.summary, sections: before.sections, encounters: before.encounters,
    resources: before.resources.map(({ asset, ...resource }: any) => resource),
  });
  await validateCombatants(actor, content, before, publishing, session);
  const resources = content.resources.map(resource => {
    const asset = before?.resources.find((existing: any) => existing.id === resource.id && existing.kind === resource.kind)?.asset;
    return { ...resource, ...(asset ? { asset } : {}) };
  });
  if (publishing && resources.some(resource => resource.kind === 'map' && !resource.asset))
    throw new McpError('validation', 'Maps require a protected attachment before publication.');

  const storedContent = { ...content, resources };
  const nextRevision = before ? before.revision + 1 : 0;
  const validated = new Adventure({ ...before, ...storedContent, libraryResourceId, status, revision: nextRevision,
    ...(publishing ? { publishedAt: new Date(), publishedRevision: nextRevision, publishedContent: storedContent } : {}) });
  await validated.validate();
  // Proposals contain only editable input, never protected storage identifiers or generated snapshot fields.
  return { operation: { ...operation, data: {
    ...(!before ? { libraryResourceId } : {}),
    ...(data.content ? { content } : {}),
    ...(data.status ? { status: data.status } : {}),
  } }, before, after: validated.toObject() };
}

/** Preserve removed catalog references, but require new/current references to respect MCP boundaries. */
async function validateCombatants(actor: Actor, content: AdventureContent, before: any, publishing: boolean, session?: ClientSession) {
  const retained = new Set<string>(before?.encounters.flatMap((encounter: any) => encounter.combatants.map((entry: any) => entry.combatantId)) || []);
  const ids = [...new Set(content.encounters.flatMap(encounter => encounter.combatants.map(entry => entry.combatantId)))];
  if (!ids.length) return;
  const found = await Combatant.find({ _id: { $in: ids } }).session(session || null).lean();
  const readable = new Set((await Combatant.find({ _id: { $in: ids }, ...visibility(actor, 'combatants') })
    .select('_id').session(session || null).lean()).map(doc => String(doc._id)));
  for (const id of ids) {
    const doc = found.find(entry => String(entry._id) === id);
    if (!doc && retained.has(id)) continue;
    if (!publishing && doc?.status === 'archived' && retained.has(id)) continue;
    if (!doc || !readable.has(id) || doc.status === 'archived' || (publishing && doc.status !== 'published'))
      throw new McpError('validation', 'Encounter combatants must exist within the readable grant and be available (published when publishing).');
  }
}

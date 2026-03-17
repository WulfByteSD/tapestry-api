import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import LoreNodeModel from '../model/LoreNodeModel';

export type LoreRelationInput = {
  type?: string;
  targetId?: string;
  targetKey?: string;
  label?: string;
  notes?: string;
};

const ALLOWED_RELATION_TYPES = ['located_in', 'member_of', 'rules', 'serves', 'allied_with', 'enemy_of', 'related_to', 'appears_in', 'originates_from'] as const;

function normalizeRelationInput(input: LoreRelationInput) {
  return {
    type: String(input.type || '').trim(),
    targetId: String(input.targetId || '').trim(),
    targetKey: String(input.targetKey || '')
      .trim()
      .toLowerCase(),
    label: String(input.label || '').trim(),
    notes: String(input.notes || '').trim(),
  };
}

export async function resolveLoreRelations(params: { settingKey: string; relations?: LoreRelationInput[]; currentNodeId?: string }) {
  const { settingKey, relations, currentNodeId } = params;

  if (!Array.isArray(relations) || relations.length === 0) {
    return [];
  }

  const cleaned = relations.map(normalizeRelationInput).filter((relation) => relation.type || relation.targetId || relation.targetKey);

  if (cleaned.length === 0) {
    return [];
  }

  for (const relation of cleaned) {
    if (!relation.type) {
      throw new ErrorUtil('Lore relation type is required', 400);
    }

    if (!ALLOWED_RELATION_TYPES.includes(relation.type as (typeof ALLOWED_RELATION_TYPES)[number])) {
      throw new ErrorUtil(`Invalid lore relation type: ${relation.type}`, 400);
    }

    if (!relation.targetId && !relation.targetKey) {
      throw new ErrorUtil('Lore relation must include targetKey or targetId', 400);
    }

    if (relation.targetId && !mongoose.Types.ObjectId.isValid(relation.targetId)) {
      throw new ErrorUtil(`Invalid lore relation targetId: ${relation.targetId}`, 400);
    }
  }

  const objectIds = cleaned.filter((relation) => relation.targetId).map((relation) => new mongoose.Types.ObjectId(relation.targetId));

  const targetKeys = cleaned.filter((relation) => relation.targetKey).map((relation) => relation.targetKey);

  const orConditions: Record<string, unknown>[] = [];

  if (objectIds.length) {
    orConditions.push({ _id: { $in: objectIds } });
  }

  if (targetKeys.length) {
    orConditions.push({ key: { $in: targetKeys } });
  }

  if (!orConditions.length) {
    return [];
  }

  const targets = await LoreNodeModel.find({
    settingKey,
    status: { $ne: 'archived' },
    $or: orConditions,
  })
    .select('_id key name')
    .lean();

  const targetsById = new Map(targets.map((target) => [String(target._id), target]));

  const targetsByKey = new Map(targets.map((target) => [String(target.key), target]));

  const normalized = cleaned.map((relation) => {
    let target = relation.targetId && targetsById.has(relation.targetId) ? targetsById.get(relation.targetId) : null;

    if (!target && relation.targetKey && targetsByKey.has(relation.targetKey)) {
      target = targetsByKey.get(relation.targetKey) ?? null;
    }

    if (!target) {
      throw new ErrorUtil(`Lore relation target not found: ${relation.targetKey || relation.targetId}`, 400);
    }

    if (currentNodeId && String(target._id) === String(currentNodeId)) {
      throw new ErrorUtil('Lore nodes cannot create relations to themselves', 400);
    }

    return {
      type: relation.type,
      targetId: String(target._id),
      targetKey: String(target.key),
      label: relation.label,
      notes: relation.notes,
    };
  });

  const deduped = new Map<string, (typeof normalized)[number]>();

  for (const relation of normalized) {
    const dedupeKey = `${relation.type}:${relation.targetId}:${relation.label}:${relation.notes}`;
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, relation);
    }
  }

  return [...deduped.values()];
}

// src/modules/game/characters/helpers/buildEffectiveAbilities.ts

import AbilityDefinitionModel from '../../content/model/AbilityDefinitionModel';
import { CharacterLearnedAbility, InventoryItem } from '../model/CharacterModel';

// computes all abilities a character has access to, based on their learned abilities, items, features, implants, and innate abilities

type EffectiveAbility = {
  abilityId: string;
  abilityKey: string;
  name: string;
  category?: string;
  sourceType: 'learned' | 'item' | 'feature' | 'implant' | 'innate';
  sourceLabel?: string;
  sourceInstanceId?: string;
  activation?: string;
  usageModel?: string;
  cost?: {
    resourceKey?: string;
    amount?: number;
    charges?: number;
    cooldownTurns?: number;
  };
  summary?: string;
  effectText?: string;
  available: boolean;
  tags?: string[];
};

type BuildEffectiveAbilitiesInput = {
  learnedAbilities: CharacterLearnedAbility[];
  inventory: InventoryItem[];
};

function normalizeId(value: unknown): string | undefined {
  if (!value) return undefined;
  return String(value);
}

function titleCaseFromKey(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}
export async function buildEffectiveAbilities({ learnedAbilities = [], inventory = [] }: BuildEffectiveAbilitiesInput): Promise<EffectiveAbility[]> {
  const learned = Array.isArray(learnedAbilities) ? learnedAbilities : [];
  const items = Array.isArray(inventory) ? inventory : [];

  const allRefs: Array<{
    abilityId?: string;
    abilityKey: string;
    sourceType: 'learned' | 'item';
    sourceLabel?: string;
    sourceInstanceId?: string;
    available: boolean;
    notes?: string;
    grantMode?: 'passive' | 'active';
  }> = [];

  for (const entry of learned) {
    if (!entry?.abilityKey) continue;

    allRefs.push({
      abilityId: normalizeId(entry.abilityId),
      abilityKey: entry.abilityKey,
      sourceType: 'learned',
      available: true,
      notes: entry.notes,
    });
  }

  for (const item of items) {
    const grants = Array.isArray(item?.grantedAbilities) ? item.grantedAbilities : [];
    if (!grants.length) continue;

    for (const grant of grants) {
      if (!grant?.abilityKey) continue;

      const requiresEquipped = grant.requiresEquipped ?? true;
      const available = requiresEquipped ? !!item.equipped : true;

      allRefs.push({
        abilityId: normalizeId(grant.abilityId),
        abilityKey: grant.abilityKey,
        sourceType: 'item',
        sourceLabel: item.name ?? 'Item',
        sourceInstanceId: item.instanceId,
        available,
        notes: grant.notes,
        grantMode: grant.grantMode,
      });
    }
  }

  const abilityIds = [...new Set(allRefs.map((ref) => ref.abilityId).filter(Boolean))] as string[];
  const abilityKeys = [...new Set(allRefs.map((ref) => ref.abilityKey).filter(Boolean))];

  const definitions = await AbilityDefinitionModel.find({
    $or: [...(abilityIds.length ? [{ _id: { $in: abilityIds } }] : []), ...(abilityKeys.length ? [{ key: { $in: abilityKeys } }] : [])],
    status: { $ne: 'archived' },
  }).lean();

  const defsById = new Map(definitions.map((def) => [String(def._id), def]));
  const defsByKey = new Map(definitions.map((def) => [def.key, def]));

  const merged = new Map<string, EffectiveAbility>();

  for (const ref of allRefs) {
    const definition = (ref.abilityId ? defsById.get(ref.abilityId) : undefined) ?? defsByKey.get(ref.abilityKey);

    const identity = definition?.key ?? ref.abilityKey;

    const existing = merged.get(identity);

    const next: EffectiveAbility = existing ?? {
      abilityId: definition?._id ? String(definition._id) : ref.abilityId,
      abilityKey: definition?.key ?? ref.abilityKey,
      name: definition?.name ?? titleCaseFromKey(ref.abilityKey),
      category: definition?.category,
      sourceType: ref.sourceType,
      sourceLabel: ref.sourceLabel,
      sourceInstanceId: ref.sourceInstanceId,
      activation: definition?.activation,
      usageModel: definition?.usageModel,
      cost: definition?.cost ?? null,
      summary: definition?.summary,
      effectText: definition?.effectText,
      available: ref.available,
      tags: definition?.tags ?? [],
      notes: ref.notes,
      grantMode: ref.grantMode,
    } as any;

    // merge duplicate sources by keeping the ability available if any source makes it available
    next.available = next.available || ref.available;

    // keep sourceType/sourceLabel/sourceInstanceId from first source for MVP.
    // Later you can expand this to `sources: []` if needed.

    merged.set(identity, next);
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

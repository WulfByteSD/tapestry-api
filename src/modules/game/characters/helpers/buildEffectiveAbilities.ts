// src/modules/game/characters/helpers/buildEffectiveAbilities.ts

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


export default function buildEffectiveAbilities(): EffectiveAbility[] {
  // stub for now - will need to pull in character data and content data to compute this properly
  return [];
}

/**
 * Canonical aspects per the Player's Guide:
 * Might[Strength], Might[Presence]
 * Finesse[Agility], Finesse[Charm]
 * Wit[Instinct], Wit[Knowledge]
 * Resolve[Willpower], Resolve[Empathy]
 *
 * Note: This interface has no corresponding Mongoose schema as it's embedded directly.
 */
export interface AspectBlock {
  strength: number;
  presence: number;
  agility: number;
  charm: number;
  instinct: number;
  knowledge: number;
  willpower: number;
  empathy: number;
}

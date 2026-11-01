/**
 * HP (Health Points) calculation and adjustment rules
 *
 * Max HP Formula: max(0, Base HP + Might [Strength] + adjustment)
 * - Base HP is 12
 * - Modified by Strength, Weave growth, and manual maximum-HP adjustments
 */

import { CharacterRuleData, BASE_HP } from '../types/RuleTypes';

/**
 * Calculate maximum HP based on character's strength
 *
 * @param character - Character data containing aspects
 * @returns Calculated max HP value
 */
export function calculateMaxHP(character: CharacterRuleData): number {
  const strength = character.aspects?.might?.strength ?? 0;
  const adjustment = character.hpAdjustment ?? 0;
  const baseHP = character.baseHP ?? BASE_HP;
  if (!Number.isSafeInteger(baseHP) || baseHP < 0) throw new Error('Base HP must be a nonnegative whole number.');
  if (!Number.isSafeInteger(adjustment)) throw new Error('Permanent HP adjustment must be a whole number.');
  const maximum = Math.max(0, baseHP + strength + adjustment);
  if (!Number.isSafeInteger(maximum)) throw new Error('Maximum HP must be a finite whole number.');
  return maximum;
}

/**
 * Adjust current HP if it exceeds the new maximum
 *
 * This ensures that when maxHP decreases (e.g., strength loss, level down),
 * the current HP is clamped to the new maximum, but only if it was higher.
 *
 * Examples:
 * - maxHP 12→8, currentHP 9 → currentHP becomes 8
 * - maxHP 12→10, currentHP 8 → currentHP stays 8
 *
 * @param character - Character data with hp resource track
 * @modifies character.hp.current if it exceeds character.hp.max
 */
export function adjustCurrentHP(character: CharacterRuleData): void {
  if (!character.hp) {
    // Initialize hp if missing
    character.hp = {
      current: BASE_HP,
      max: BASE_HP,
      temp: 0,
    };
    return;
  }

  // Clamp current to max if it exceeds
  if (character.hp.current > character.hp.max) {
    character.hp.current = character.hp.max;
  }

  // Ensure non-negative
  if (character.hp.current < 0) {
    character.hp.current = 0;
  }
}

/**
 * Apply all HP rules to a character
 *
 * @param character - Character data to apply rules to
 * @modifies character.hp.max and character.hp.current
 */
export function applyHPRules(character: CharacterRuleData): void {
  // Calculate and set max HP
  character.hp.max = calculateMaxHP(character);

  // Adjust current HP if needed
  adjustCurrentHP(character);
}

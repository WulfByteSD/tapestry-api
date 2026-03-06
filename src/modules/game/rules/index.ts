/**
 * Game Rules Module
 *
 * This module provides rule enforcement for the Tapestry game system.
 * Rules are automatically applied during character creation and updates.
 *
 * Rules Enforced:
 * 1. Aspect Range Validation: All sub-aspects must be within -2 to +4
 * 2. HP Max Calculation: maxHP = 12 + Might [Strength]
 * 3. HP Current Adjustment: current HP clamped to max when max decreases
 * 4. Threads Range: All thread values clamped to 0-5
 *
 * Usage:
 *   import { applyCharacterRules } from './rules';
 *   const validatedCharacter = applyCharacterRules(characterData);
 */

import { CharacterRuleData } from './types/RuleTypes';
import { validateAspectRanges } from './attributes/aspectRules';
import { applyHPRules } from './resources/hpRules';
import { enforceThreadsRange } from './resources/threadsRules';

/**
 * Apply all game rules to a character
 *
 * This is the main entry point for rule enforcement. It orchestrates
 * all validation and calculation rules in the correct order.
 *
 * Order of operations:
 * 1. Validate aspect ranges (throws on failure)
 * 2. Calculate maxHP and adjust currentHP
 * 3. Enforce threads range (0-5 cap)
 *
 * @param characterData - Character data to validate and modify
 * @returns Modified character data with all rules applied
 * @throws Error if any validation rules fail
 *
 * @example
 * ```typescript
 * const character = {
 *   aspects: { might: { strength: 5, presence: 2 }, ... },
 *   hp: { current: 15, max: 15 },
 *   threads: { current: 3, max: 5 }
 * };
 *
 * const validatedCharacter = applyCharacterRules(character);
 * // validatedCharacter.hp.max === 17 (12 + 5)
 * ```
 */
export function applyCharacterRules(characterData: CharacterRuleData): CharacterRuleData {
  // Step 1: Validate aspect ranges
  // This will throw an error if any aspect is out of the -2 to +4 range
  validateAspectRanges(characterData);

  // Step 2: Apply HP rules
  // - Calculate maxHP = 12 + strength
  // - Adjust currentHP if it exceeds the new max
  applyHPRules(characterData);

  // Step 3: Enforce threads range
  // - Clamp threads.current, threads.max, threads.temp to 0-5
  enforceThreadsRange(characterData);
  console.log('Applied threads rules:', characterData);
  return characterData;
}

// Re-export types and constants for convenience
export * from './types/RuleTypes';
export { validateAspectRanges, getAspectRangeDescription } from './attributes/aspectRules';
export { calculateMaxHP, adjustCurrentHP, applyHPRules } from './resources/hpRules';
export { enforceThreadsRange } from './resources/threadsRules';
export { resolveAttackOutcome } from './combat/attackOutcomeRules';

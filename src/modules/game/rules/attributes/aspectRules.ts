/**
 * Aspect range validation rules
 *
 * Aspects (sub-aspects) have a legal range of -2 to +4 for direct character edits.
 * Explicit house-rule overrides lift the range; finite integer validation remains.
 */

import { CharacterRuleData, AspectFamily, ASPECT_MIN, ASPECT_MAX, RuleViolation } from '../types/RuleTypes';

/**
 * Check if an aspect value is within the legal range
 *
 * @param value - Aspect value to check
 * @returns true if within range, false otherwise
 */
function isAspectValueValid(value: number): boolean {
  return value >= ASPECT_MIN && value <= ASPECT_MAX;
}

/**
 * Validate that all character aspects are within legal ranges (-2 to +4)
 *
 * This function checks all sub-aspects across the four families:
 * - Might: strength, presence
 * - Finesse: agility, charm
 * - Wit: instinct, knowledge
 * - Resolve: willpower, empathy
 *
 * @param character - Character data containing aspects
 * @throws Error if any aspect is out of range
 */
export function validateAspectRanges(character: CharacterRuleData): void {
  const violations: RuleViolation[] = [];

  if (!character.aspects) {
    throw new Error('Character aspects are missing or undefined');
  }

  // Define aspect families and their sub-aspects
  const aspectFamilies: Record<AspectFamily, string[]> = {
    might: ['strength', 'presence'],
    finesse: ['agility', 'charm'],
    wit: ['instinct', 'knowledge'],
    resolve: ['willpower', 'empathy'],
  };

  // Validate each aspect family
  for (const [family, subAspects] of Object.entries(aspectFamilies)) {
    const familyData = character.aspects[family as AspectFamily];

    if (!familyData) {
      throw new Error(`Aspect family '${family}' is missing`);
    }

    // Validate each sub-aspect in the family
    for (const subAspect of subAspects) {
      const value = (familyData as any)[subAspect];

      if (value === undefined || value === null) {
        throw new Error(`Sub-aspect '${family}.${subAspect}' is missing or undefined`);
      }

      if (!Number.isSafeInteger(value) || (!character.houseRuleOverride && !isAspectValueValid(value))) {
        violations.push({
          field: `aspects.${family}.${subAspect}`,
          value: value,
          expectedRange: { min: ASPECT_MIN, max: ASPECT_MAX },
          message: `${family}.${subAspect} value ${value} is outside the legal range (${ASPECT_MIN} to ${ASPECT_MAX})`,
        });
      }
    }
  }

  // If any violations found, throw error with details
  if (violations.length > 0) {
    const errorMessages = violations.map((v) => v.message).join('; ');
    throw new Error(`Aspect validation failed: ${errorMessages}`);
  }
}

/**
 * Get a human-readable description of the aspect ranges
 *
 * @returns Description string for documentation/error messages
 */
export function getAspectRangeDescription(): string {
  return `Aspects must be between ${ASPECT_MIN} and ${ASPECT_MAX} (inclusive)`;
}

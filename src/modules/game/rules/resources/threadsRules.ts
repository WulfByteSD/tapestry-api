/**
 * Threads resource enforcement rules
 *
 * Threads are a special resource with a fixed range (0-5)
 * Unlike HP, threads do not scale with character attributes
 */

import { CharacterRuleData, THREADS_MIN, THREADS_MAX } from '../types/RuleTypes';

/**
 * Clamp a value to the threads range (0-5)
 *
 * @param value - Value to clamp
 * @returns Clamped value within valid range
 */
function clampToThreadsRange(value: number): number {
  // console.log(`Clamping threads value: ${value} to range ${THREADS_MIN}-${THREADS_MAX}`);
  return Math.max(THREADS_MIN, Math.min(THREADS_MAX, value));
}

/**
 * Clamp threads max to valid range (3-5)
 * Threads max can only be 3, 4, or 5
 *
 * @param value - Max threads value to clamp
 * @returns Clamped value within valid max range
 */
function clampThreadsMax(value: number): number {
  return Math.max(3, Math.min(THREADS_MAX, value));
}

/**
 * Enforce threads range on all thread resource values
 *
 * Ensures that:
 * - threads.max is between 3-5 (inclusive)
 * - threads.current is between 0 and threads.max
 * - threads.temp is between 0 and threads.max
 *
 * @param character - Character data with threads resource track
 * @modifies character.threads values to be within valid range
 */
export function enforceThreadsRange(character: CharacterRuleData): void {
  if (!character.threads) {
    // Initialize threads if missing
    character.threads = {
      current: THREADS_MAX,
      max: THREADS_MAX,
      temp: 0,
    };
    return;
  }

  // Enforce maximum threads cap (must be between 3-5)
  character.threads.max = clampThreadsMax(character.threads.max ?? THREADS_MAX);

  // Clamp current to valid range (0 to threads.max)
  character.threads.current = Math.max(0, Math.min(character.threads.max, character.threads.current ?? 0));

  // Clamp temp to valid range (0 to threads.max)
  if (character.threads.temp !== undefined) {
    character.threads.temp = Math.max(0, Math.min(character.threads.max, character.threads.temp));
  }
}

/**
 * Threads resource enforcement rules
 *
 * Core capacities default to 3-5. A character sheet can supply an explicit
 * nonnegative capacity, independently of Aspect house-rule overrides.
 * Standard advancement allows two increases above base; house-rule overrides
 * also permit further guided growth, subject to safe integer validation.
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
 * Enforce capacity and bound current/temporary Threads to that capacity.
 *
 * Ensures that:
 * - threads.max uses explicit sheet capacity, or the core 3-5 default range
 * - threads.current is between 0 and threads.max
 * - threads.temp is between 0 and threads.max
 *
 * @param character - Character data with threads resource track
 * @modifies character.threads values to be within valid range
 */
export function enforceThreadsRange(character: CharacterRuleData): void {
  const capacity = character.threadCapacity;
  if (capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 0)) throw new Error('Thread capacity must be a nonnegative whole number.');
  if (!character.threads) {
    // Initialize threads if missing
    character.threads = {
      current: capacity === undefined ? THREADS_MAX : 0,
      max: capacity ?? THREADS_MAX,
      temp: 0,
    };
    return;
  }

  // Validate integers before applying the chosen capacity.
  for (const value of Object.values(character.threads)) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Threads must use whole numbers.');
  }
  if (capacity !== undefined) {
    character.threads.max = capacity;
  } else {
    character.threads.max = character.houseRuleOverride
      ? Math.max(0, character.threads.max ?? THREADS_MAX)
      : clampThreadsMax(character.threads.max ?? THREADS_MAX);
  }

  // Clamp current to valid range (0 to threads.max)
  character.threads.current = Math.max(0, Math.min(character.threads.max, character.threads.current ?? 0));

  // Clamp temp to valid range (0 to threads.max)
  if (character.threads.temp !== undefined) {
    character.threads.temp = Math.max(0, Math.min(character.threads.max, character.threads.temp));
  }
}

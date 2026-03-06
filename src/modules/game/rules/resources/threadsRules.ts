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
  console.log(`Clamping threads value: ${value} to range ${THREADS_MIN}-${THREADS_MAX}`);
  return Math.max(THREADS_MIN, Math.min(THREADS_MAX, value));
}

/**
 * Enforce threads range on all thread resource values
 *
 * Ensures that threads.current, threads.max, and threads.temp
 * are all within the valid range (0-5)
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
  console.log('Before enforcing threads rules:', character.threads);

  // Enforce maximum threads cap
  character.threads.max = clampToThreadsRange(Math.max(character.threads.max, 3) ?? THREADS_MAX);

  // Clamp current and temp to valid range
  character.threads.current = clampToThreadsRange(character.threads.current ?? 0);

  if (character.threads.temp !== undefined) {
    character.threads.temp = clampToThreadsRange(character.threads.temp);
  }
}

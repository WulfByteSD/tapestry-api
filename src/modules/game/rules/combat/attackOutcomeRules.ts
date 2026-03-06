export type AttackOutcome = 'miss' | 'weak_hit' | 'hit' | 'strong_hit';

export interface AttackResolution {
  targetNumber: number;
  margin: number;
  outcome: AttackOutcome;
}

/**
 * Draft thresholds based on current discussion:
 * - total <= tn - 3 => miss
 * - total === tn - 2 => weak_hit
 * - total >= tn && total <= tn + 2 => hit
 * - total >= tn + 3 => strong_hit
 *
 * Adjust here once your final combat ladder is locked in.
 */
export function resolveAttackOutcome(total: number, targetNumber: number): AttackResolution {
  const margin = total - targetNumber;
  // if the margin is -3 or less, its a miss
  if (margin <= -3) {
    return { targetNumber, margin, outcome: 'miss' };
  }
  // if the margin is -2, or -1, its a weak hit
  if (margin <= -2) {
    return { targetNumber, margin, outcome: 'weak_hit' };
  }
  // if its greater than +2 of the TN, its a strong hit
  if (margin >= 3) {
    return { targetNumber, margin, outcome: 'strong_hit' };
  }
  // otherwise its a normal hit
  return { targetNumber, margin, outcome: 'hit' };
}

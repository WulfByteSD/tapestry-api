/**
 * DiceRoller Module
 *
 * Exports:
 * - DiceRollerService: Main dice rolling service with Random.org API integration
 * - DiceExpressionParser: Utility to parse string expressions into structured params
 * - Types: All DiceRoller type definitions
 */

export { default as DiceRollerService } from './DiceRollerService';
export { default as DiceExpressionParser } from './DiceExpressionParser';

// Re-export types for convenience
export type { DiceRollParams, DiceOperation, BasicRollResult, AdvancedRollResult, RandomOrgResponse } from './types/DiceRollerTypes';

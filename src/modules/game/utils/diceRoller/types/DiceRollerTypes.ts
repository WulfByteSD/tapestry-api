/**
 * DiceRoller Type Definitions
 *
 * All interfaces and types for the DiceRoller module
 */

// ============================================================================
// Input Types
// ============================================================================

/**
 * Parameters for rolling dice
 *
 * Supports three modes:
 * 1. Semantic flags: edge/burden (backend calculates keep values)
 * 2. Explicit numeric: keepBest/keepWorst (manual override)
 * 3. Standard roll: no keep logic
 *
 * Precedence: explicit numeric > semantic boolean > no keep logic
 * Conflicts: Cannot mix edge/burden with explicit keep values
 */
export interface DiceRollParams {
  diceCount: number;
  faces: number;

  // Semantic game mechanics (Tapestry rules)
  edge?: boolean; // Edge mechanic: roll 4d6, keep best 3
  burden?: boolean; // Burden mechanic: roll 4d6, keep worst 3

  // Explicit overrides (for custom scenarios)
  keepBest?: number; // Manual: keep N best rolls
  keepWorst?: number; // Manual: keep N worst rolls

  operations?: DiceOperation[];
}

export interface DiceOperation {
  operator: '+' | '-' | '*' | '/';
  value: number;
}

// ============================================================================
// Result Types
// ============================================================================

export interface BasicRollResult {
  rolls: number[];
  total: number;
  faces: number;
  modifier: number;
}

export interface AdvancedRollResult {
  allRolls: number[];
  keptRolls: number[];
  total: number;
  expression: string;
  breakdown?: string; // Human-readable breakdown of the roll
}

// ============================================================================
// API Types
// ============================================================================

export interface RandomOrgResponse {
  jsonrpc: string;
  result?: {
    random?: {
      data?: number[];
    };
  };
  error?: {
    message: string;
    code: number;
  };
}

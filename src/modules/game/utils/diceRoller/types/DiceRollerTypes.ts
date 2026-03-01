/**
 * DiceRoller Type Definitions
 *
 * All interfaces and types for the DiceRoller module
 */

// ============================================================================
// Input Types
// ============================================================================

export interface DiceRollParams {
  diceCount: number;
  faces: number;
  keepBest?: number;
  keepWorst?: number;
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

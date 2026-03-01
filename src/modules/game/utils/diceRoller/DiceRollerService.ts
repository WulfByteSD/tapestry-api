import axios from 'axios';
import crypto from 'crypto';
import { DiceRollParams, DiceOperation, BasicRollResult, AdvancedRollResult, RandomOrgResponse } from './types/DiceRollerTypes';

/**
 * DiceRollerService - Standalone utility for rolling dice with Random.org API integration
 *
 * Features:
 * - Structured parameter input (type-safe)
 * - Random.org API for true randomness based on atmospheric noise
 * - Simulated dice roll fallback when API unavailable
 * - Support for keep best/worst (edge/burden mechanics)
 * - PEMDAS operation support (+, -, *, /)
 *
 * Environment Variables:
 * - RANDOM_ORG_API_KEY: API key for Random.org (optional, falls back to simulation)
 */

export default class DiceRollerService {
  private static readonly RANDOM_ORG_BASE_URL = 'https://api.random.org/json-rpc/4/invoke';
  private static readonly MAX_BOUNCE_COUNT = 25;

  // Tapestry game rules: Edge/Burden mechanics
  private static readonly EDGE_DICE_COUNT = 4;
  private static readonly EDGE_KEEP_BEST = 3;
  private static readonly BURDEN_DICE_COUNT = 4;
  private static readonly BURDEN_KEEP_WORST = 3;

  /**
   * Basic dice roll with structured parameters
   * Example: { diceCount: 2, faces: 20, operations: [{operator: '+', value: 2}] }
   */
  public async roll(params: DiceRollParams): Promise<BasicRollResult> {
    try {
      // Validate parameters
      this.validateParams(params);

      const { diceCount, faces, operations = [] } = params;

      // Roll all dice
      const rolls: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        const rollValue = await this.rollDiceUsingApi(1, 1, faces);
        rolls.push(rollValue);
      }

      // Calculate base total (sum of all dice)
      let total = rolls.reduce((sum, roll) => sum + roll, 0);

      // Apply operations
      total = this.applyOperations(total, operations);

      // Calculate the flat modifier (for backwards compatibility)
      const modifier = this.calculateModifier(operations);

      return {
        rolls,
        total,
        faces,
        modifier,
      };
    } catch (error: any) {
      console.error('Error in roll():', error.message);
      return {
        rolls: [],
        total: 0,
        faces: params.faces || 0,
        modifier: 0,
      };
    }
  }

  /**
   * Advanced dice roll with keep best/worst and PEMDAS operations
   * Supports Tapestry's edge/burden mechanics (4d6b3/4d6w3)
   */
  public async rollAdvanced(params: DiceRollParams): Promise<AdvancedRollResult> {
    try {
      // Validate parameters
      this.validateParams(params);

      let { diceCount, faces, keepBest, keepWorst, edge, burden, operations = [] } = params;

      // Interpret semantic flags if no explicit keep values provided
      if (!keepBest && !keepWorst) {
        if (edge) {
          diceCount = DiceRollerService.EDGE_DICE_COUNT;
          keepBest = DiceRollerService.EDGE_KEEP_BEST;
        } else if (burden) {
          diceCount = DiceRollerService.BURDEN_DICE_COUNT;
          keepWorst = DiceRollerService.BURDEN_KEEP_WORST;
        }
      }

      // Roll all dice
      const allRolls: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        const rollValue = await this.rollDiceUsingApi(1, 1, faces);
        allRolls.push(rollValue);
      }

      // Apply keep best/worst logic
      const keptRolls = this.applyKeepLogic(allRolls, keepBest, keepWorst);

      // Calculate base total from kept rolls
      let total = keptRolls.reduce((sum, roll) => sum + roll, 0);

      // Build breakdown string
      let breakdown = this.buildBreakdown(allRolls, keptRolls, operations);

      // Apply operations with PEMDAS order
      total = this.applyOperations(total, operations);

      // Build expression string for reference
      const expression = this.buildExpression(diceCount, faces, keepBest, keepWorst, operations, edge, burden);

      return {
        allRolls,
        keptRolls,
        total,
        expression,
        breakdown,
      };
    } catch (error: any) {
      console.error('Error in rollAdvanced():', error.message);
      return {
        allRolls: [],
        keptRolls: [],
        total: 0,
        expression: '',
        breakdown: 'Error occurred during roll',
      };
    }
  }

  // ============================================================================
  // Random.org API Integration
  // ============================================================================

  /**
   * Roll dice using Random.org API for true randomness
   * Falls back to simulated roll if API unavailable
   */
  private async rollDiceUsingApi(num: number, min: number, max: number): Promise<number> {
    const apiKey = process.env.RANDOM_ORG_API_KEY;

    // If no API key, fall back immediately
    if (!apiKey) {
      console.warn('RANDOM_ORG_API_KEY not set. Using simulated roll.');
      return this.simulatedDiceRoll(min, max);
    }

    try {
      const requestId = crypto.randomUUID();

      // Construct Random.org JSON-RPC request
      const requestBody = {
        jsonrpc: '2.0',
        method: 'generateIntegers',
        params: {
          apiKey,
          n: num,
          min,
          max,
          replacement: true,
        },
        id: requestId,
      };

      // Make the API request
      const response = await axios.post<RandomOrgResponse>(DiceRollerService.RANDOM_ORG_BASE_URL, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000, // 5 second timeout
      });

      // Check for API errors
      if (response.data.error) {
        console.warn(`Random.org API error: ${response.data.error.message}`);
        return this.simulatedDiceRoll(min, max);
      }

      // Extract the random number
      const data = response.data.result?.random?.data;
      if (data && data.length > 0) {
        return data[0];
      } else {
        console.warn('Invalid response from Random.org. Falling back to simulated roll.');
        return this.simulatedDiceRoll(min, max);
      }
    } catch (error: any) {
      console.warn('Failed to fetch from Random.org. Falling back to simulated roll.');
      if (error.message) {
        console.warn(`Error message: ${error.message}`);
      }
      return this.simulatedDiceRoll(min, max);
    }
  }

  /**
   * Simulated dice roll - fallback when Random.org unavailable
   * Simulates dice bouncing for more realistic randomness
   */
  private simulatedDiceRoll(min: number, max: number): number {
    // Generate random number of bounces (5-25)
    const times = Math.floor(Math.random() * DiceRollerService.MAX_BOUNCE_COUNT) + 5; // Minimum 5 bounces for better randomness
    let roll = 0;

    // Simulate multiple bounces
    for (let i = 0; i < times; i++) {
      roll += Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Apply modulo to ensure result is within range
    return (roll % (max - min + 1)) + min;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Validate dice roll parameters
   */
  private validateParams(params: DiceRollParams): void {
    // Validate edge/burden semantic flags
    if (params.edge && params.burden) {
      throw new Error('Cannot specify both edge and burden');
    }

    // Cannot mix semantic flags with explicit keep values
    if ((params.edge || params.burden) && (params.keepBest || params.keepWorst)) {
      throw new Error('Cannot specify edge/burden with explicit keepBest/keepWorst');
    }

    // Basic dice validation (skip diceCount check if using semantic flags)
    if (!params.edge && !params.burden) {
      if (!params.diceCount || params.diceCount < 1) {
        throw new Error('diceCount must be at least 1');
      }
    }

    if (!params.faces || params.faces < 2) {
      throw new Error('faces must be at least 2');
    }

    // Validate explicit keep values (only if not using semantic flags)
    if (!params.edge && !params.burden) {
      if (params.keepBest && params.keepWorst) {
        throw new Error('Cannot specify both keepBest and keepWorst');
      }

      if (params.keepBest && params.keepBest > params.diceCount) {
        throw new Error('keepBest cannot be greater than diceCount');
      }

      if (params.keepWorst && params.keepWorst > params.diceCount) {
        throw new Error('keepWorst cannot be greater than diceCount');
      }

      if (params.keepBest && params.keepBest < 1) {
        throw new Error('keepBest must be at least 1');
      }

      if (params.keepWorst && params.keepWorst < 1) {
        throw new Error('keepWorst must be at least 1');
      }
    }
  }

  /**
   * Apply keep best/worst logic to dice rolls
   * Edge mechanic: keepBest (take highest N rolls)
   * Burden mechanic: keepWorst (take lowest N rolls)
   */
  private applyKeepLogic(allRolls: number[], keepBest?: number, keepWorst?: number): number[] {
    if (keepBest) {
      // Sort descending and take the best N
      return [...allRolls].sort((a, b) => b - a).slice(0, keepBest);
    } else if (keepWorst) {
      // Sort ascending and take the worst N
      return [...allRolls].sort((a, b) => a - b).slice(0, keepWorst);
    } else {
      // Keep all rolls
      return [...allRolls];
    }
  }

  /**
   * Apply operations with proper PEMDAS order
   * Process multiplication and division first, then addition and subtraction
   */
  private applyOperations(baseValue: number, operations: DiceOperation[]): number {
    let result = baseValue;

    // First pass: multiplication and division (left to right)
    const remainingOps: DiceOperation[] = [];
    for (const op of operations) {
      if (op.operator === '*') {
        result *= op.value;
      } else if (op.operator === '/') {
        if (op.value === 0) {
          console.warn('Division by zero attempted, skipping operation');
          continue;
        }
        result = Math.floor(result / op.value); // Integer division
      } else {
        remainingOps.push(op);
      }
    }

    // Second pass: addition and subtraction (left to right)
    for (const op of remainingOps) {
      if (op.operator === '+') {
        result += op.value;
      } else if (op.operator === '-') {
        result -= op.value;
      }
    }

    return result;
  }

  /**
   * Calculate flat modifier from operations (for backwards compatibility)
   * Only sums + and - operations
   */
  private calculateModifier(operations: DiceOperation[]): number {
    return operations.reduce((sum, op) => {
      if (op.operator === '+') {
        return sum + op.value;
      } else if (op.operator === '-') {
        return sum - op.value;
      }
      return sum;
    }, 0);
  }

  /**
   * Build human-readable breakdown of the roll
   */
  private buildBreakdown(allRolls: number[], keptRolls: number[], operations: DiceOperation[]): string {
    const rollsStr = allRolls.join(', ');
    const keptStr = keptRolls.join(', ');
    const baseTotal = keptRolls.reduce((sum, roll) => sum + roll, 0);

    if (allRolls.length !== keptRolls.length) {
      let breakdown = `Rolled: [${rollsStr}] → Kept: [${keptStr}] = ${baseTotal}`;

      if (operations.length > 0) {
        const opsStr = operations.map((op) => `${op.operator}${op.value}`).join(' ');
        breakdown += ` ${opsStr}`;
      }

      return breakdown;
    } else {
      let breakdown = `Rolled: [${rollsStr}] = ${baseTotal}`;

      if (operations.length > 0) {
        const opsStr = operations.map((op) => `${op.operator}${op.value}`).join(' ');
        breakdown += ` ${opsStr}`;
      }

      return breakdown;
    }
  }

  /**
   * Build expression string for reference
   * Supports semantic notation: 4d6e (edge), 4d6b (burden)
   */
  private buildExpression(diceCount: number, faces: number, keepBest?: number, keepWorst?: number, operations: DiceOperation[] = [], edge?: boolean, burden?: boolean): string {
    let expr = `${diceCount}d${faces}`;

    // Use semantic notation for edge/burden
    if (edge) {
      expr += 'e';
    } else if (burden) {
      expr += 'b';
    } else if (keepBest) {
      // Explicit numeric notation
      expr += `b${keepBest}`;
    } else if (keepWorst) {
      // Explicit numeric notation
      expr += `w${keepWorst}`;
    }

    for (const op of operations) {
      // Use 'x' for multiplication in expression for readability
      const operator = op.operator === '*' ? 'x' : op.operator;
      expr += `${operator}${op.value}`;
    }

    return expr;
  }
}

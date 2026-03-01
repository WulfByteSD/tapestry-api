import { DiceRollParams, DiceOperation } from './types/DiceRollerTypes';

/**
 * DiceExpressionParser - Utility to parse dice notation strings into structured parameters
 *
 * Supports:
 * - Basic notation: "2d20", "3d6", "1d10"
 * - With modifiers: "2d20+2", "3d6-1"
 * - Keep best/worst: "4d6b3", "4d6w3" (edge/burden mechanics)
 * - PEMDAS operations: "3d6x2+1", "2d20+5x3-2", "4d6/2"
 * - Combined: "4d6b3+2", "4d6w3-1x2"
 *
 * Example usage:
 *   const params = DiceExpressionParser.parse("4d6b3+2");
 *   // returns: { diceCount: 4, faces: 6, keepBest: 3, operations: [{operator: '+', value: 2}] }
 */

export default class DiceExpressionParser {
  // Regex patterns
  private static readonly KEEP_BEST_PATTERN = /(\d*d\d+)b(\d+)/i;
  private static readonly KEEP_WORST_PATTERN = /(\d*d\d+)w(\d+)/i;
  private static readonly BASIC_DICE_PATTERN = /^(\d*)d(\d+)/i;
  private static readonly OPERATION_PATTERN = /([+\-x*/])(\d+)/g;

  /**
   * Parse a dice expression string into structured parameters
   * @param expression - Dice notation string (e.g., "4d6b3+2", "2d20", "3d6x2-1")
   * @returns DiceRollParams object for use with DiceRollerService
   * @throws Error if expression format is invalid
   */
  public static parse(expression: string): DiceRollParams {
    try {
      // Remove all spaces for consistent parsing
      const cleanExpr = expression.replace(/\s/g, '').toLowerCase();

      if (!cleanExpr) {
        throw new Error('Expression cannot be empty');
      }

      // Step 1: Extract keep best/worst modifiers
      const { cleanExpression, keepBest, keepWorst } = this.parseKeepModifiers(cleanExpr);

      // Step 2: Extract basic dice notation (XdY)
      const { diceCount, faces, remainder } = this.parseBasicDice(cleanExpression);

      // Step 3: Parse operations from the remainder
      const operations = this.parseOperations(remainder);

      // Build the params object
      const params: DiceRollParams = {
        diceCount,
        faces,
      };

      if (keepBest !== undefined) {
        params.keepBest = keepBest;
      }

      if (keepWorst !== undefined) {
        params.keepWorst = keepWorst;
      }

      if (operations.length > 0) {
        params.operations = operations;
      }

      return params;
    } catch (error: any) {
      throw new Error(`Failed to parse dice expression "${expression}": ${error.message}`);
    }
  }

  /**
   * Parse keep best/worst modifiers from expression
   * Examples: "4d6b3" -> keepBest: 3, "4d6w2" -> keepWorst: 2
   */
  private static parseKeepModifiers(expression: string): {
    cleanExpression: string;
    keepBest?: number;
    keepWorst?: number;
  } {
    let cleanExpression = expression;
    let keepBest: number | undefined;
    let keepWorst: number | undefined;

    // Check for keep best (b)
    const bestMatch = expression.match(this.KEEP_BEST_PATTERN);
    if (bestMatch) {
      keepBest = parseInt(bestMatch[2], 10);
      // Remove the 'b3' part from expression, leaving '4d6'
      cleanExpression = expression.replace(bestMatch[0], bestMatch[1]);
    }

    // Check for keep worst (w)
    const worstMatch = expression.match(this.KEEP_WORST_PATTERN);
    if (worstMatch) {
      if (keepBest !== undefined) {
        throw new Error('Cannot specify both keep best (b) and keep worst (w)');
      }
      keepWorst = parseInt(worstMatch[2], 10);
      // Remove the 'w3' part from expression, leaving '4d6'
      cleanExpression = expression.replace(worstMatch[0], worstMatch[1]);
    }

    return { cleanExpression, keepBest, keepWorst };
  }

  /**
   * Parse basic dice notation (XdY)
   * Examples: "2d20" -> diceCount: 2, faces: 20
   *           "d6" -> diceCount: 1, faces: 6
   */
  private static parseBasicDice(expression: string): {
    diceCount: number;
    faces: number;
    remainder: string;
  } {
    const match = expression.match(this.BASIC_DICE_PATTERN);

    if (!match) {
      throw new Error('Invalid dice notation. Expected format: XdY (e.g., 2d20, d6, 3d6)');
    }

    // Extract dice count (default to 1 if not specified)
    const diceCount = match[1] ? parseInt(match[1], 10) : 1;
    const faces = parseInt(match[2], 10);

    // Validate
    if (diceCount < 1) {
      throw new Error('Dice count must be at least 1');
    }

    if (faces < 2) {
      throw new Error('Dice faces must be at least 2');
    }

    // Get the remainder of the expression (operations)
    const remainder = expression.substring(match[0].length);

    return { diceCount, faces, remainder };
  }

  /**
   * Parse operations from the remainder of the expression
   * Examples: "+2-1" -> [{operator: '+', value: 2}, {operator: '-', value: 1}]
   *           "x2+3" -> [{operator: '*', value: 2}, {operator: '+', value: 3}]
   */
  private static parseOperations(remainder: string): DiceOperation[] {
    if (!remainder) {
      return [];
    }

    const operations: DiceOperation[] = [];
    const matches = remainder.matchAll(this.OPERATION_PATTERN);

    for (const match of matches) {
      let operator = match[1];
      const value = parseInt(match[2], 10);

      // Convert 'x' to '*' for multiplication
      if (operator === 'x') {
        operator = '*';
      }

      // Validate operator
      if (!['+', '-', '*', '/'].includes(operator)) {
        throw new Error(`Invalid operator: ${operator}`);
      }

      // Validate value
      if (isNaN(value) || value < 0) {
        throw new Error(`Invalid operation value: ${match[2]}`);
      }

      operations.push({
        operator: operator as '+' | '-' | '*' | '/',
        value,
      });
    }

    // Check if we parsed the entire remainder
    const reconstructed = operations
      .map((op) => {
        const opSymbol = op.operator === '*' ? 'x' : op.operator;
        return `${opSymbol}${op.value}`;
      })
      .join('');

    if (reconstructed !== remainder.replace(/x/g, 'x')) {
      throw new Error(`Invalid operations format: ${remainder}`);
    }

    return operations;
  }

  /**
   * Validate a parsed params object
   * @param params - DiceRollParams to validate
   * @throws Error if params are invalid
   */
  public static validate(params: DiceRollParams): void {
    if (!params.diceCount || params.diceCount < 1) {
      throw new Error('diceCount must be at least 1');
    }

    if (!params.faces || params.faces < 2) {
      throw new Error('faces must be at least 2');
    }

    if (params.keepBest && params.keepWorst) {
      throw new Error('Cannot specify both keepBest and keepWorst');
    }

    if (params.keepBest && params.keepBest > params.diceCount) {
      throw new Error(`keepBest (${params.keepBest}) cannot be greater than diceCount (${params.diceCount})`);
    }

    if (params.keepWorst && params.keepWorst > params.diceCount) {
      throw new Error(`keepWorst (${params.keepWorst}) cannot be greater than diceCount (${params.diceCount})`);
    }

    if (params.keepBest && params.keepBest < 1) {
      throw new Error('keepBest must be at least 1');
    }

    if (params.keepWorst && params.keepWorst < 1) {
      throw new Error('keepWorst must be at least 1');
    }

    // Validate operations
    if (params.operations) {
      for (const op of params.operations) {
        if (!['+', '-', '*', '/'].includes(op.operator)) {
          throw new Error(`Invalid operator: ${op.operator}`);
        }

        if (typeof op.value !== 'number' || op.value < 0) {
          throw new Error(`Invalid operation value: ${op.value}`);
        }

        if (op.operator === '/' && op.value === 0) {
          throw new Error('Division by zero is not allowed');
        }
      }
    }
  }

  /**
   * Convert structured params back to expression string
   * Useful for logging and debugging
   */
  public static stringify(params: DiceRollParams): string {
    let expr = `${params.diceCount}d${params.faces}`;

    if (params.keepBest) {
      expr += `b${params.keepBest}`;
    } else if (params.keepWorst) {
      expr += `w${params.keepWorst}`;
    }

    if (params.operations) {
      for (const op of params.operations) {
        // Use 'x' for multiplication in string representation
        const opSymbol = op.operator === '*' ? 'x' : op.operator;
        expr += `${opSymbol}${op.value}`;
      }
    }

    return expr;
  }
}

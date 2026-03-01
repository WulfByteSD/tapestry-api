/**
 * Tests for DiceExpressionParser
 */

import DiceExpressionParser from '../DiceExpressionParser';
import { DiceRollParams } from '../types/DiceRollerTypes';

describe('DiceExpressionParser', () => {
  describe('parse() - Basic expressions', () => {
    it('should parse "2d20"', () => {
      const result = DiceExpressionParser.parse('2d20');

      expect(result.diceCount).toBe(2);
      expect(result.faces).toBe(20);
      expect(result.keepBest).toBeUndefined();
      expect(result.keepWorst).toBeUndefined();
      expect(result.operations).toBeUndefined();
    });

    it('should parse "d6" as 1d6', () => {
      const result = DiceExpressionParser.parse('d6');

      expect(result.diceCount).toBe(1);
      expect(result.faces).toBe(6);
    });

    it('should parse "3d6"', () => {
      const result = DiceExpressionParser.parse('3d6');

      expect(result.diceCount).toBe(3);
      expect(result.faces).toBe(6);
    });

    it('should parse case-insensitive (2D20)', () => {
      const result = DiceExpressionParser.parse('2D20');

      expect(result.diceCount).toBe(2);
      expect(result.faces).toBe(20);
    });

    it('should ignore whitespace', () => {
      const result = DiceExpressionParser.parse(' 2 d 20 + 2 ');

      expect(result.diceCount).toBe(2);
      expect(result.faces).toBe(20);
      expect(result.operations).toEqual([{ operator: '+', value: 2 }]);
    });
  });

  describe('parse() - With modifiers', () => {
    it('should parse "2d20+2"', () => {
      const result = DiceExpressionParser.parse('2d20+2');

      expect(result.diceCount).toBe(2);
      expect(result.faces).toBe(20);
      expect(result.operations).toEqual([{ operator: '+', value: 2 }]);
    });

    it('should parse "3d6-1"', () => {
      const result = DiceExpressionParser.parse('3d6-1');

      expect(result.diceCount).toBe(3);
      expect(result.faces).toBe(6);
      expect(result.operations).toEqual([{ operator: '-', value: 1 }]);
    });

    it('should parse multiple modifiers "2d6+2-1"', () => {
      const result = DiceExpressionParser.parse('2d6+2-1');

      expect(result.diceCount).toBe(2);
      expect(result.faces).toBe(6);
      expect(result.operations).toEqual([
        { operator: '+', value: 2 },
        { operator: '-', value: 1 },
      ]);
    });
  });

  describe('parse() - Keep best/worst (edge/burden)', () => {
    it('should parse "4d6b3" (keep best 3)', () => {
      const result = DiceExpressionParser.parse('4d6b3');

      expect(result.diceCount).toBe(4);
      expect(result.faces).toBe(6);
      expect(result.keepBest).toBe(3);
      expect(result.keepWorst).toBeUndefined();
    });

    it('should parse "4d6w3" (keep worst 3)', () => {
      const result = DiceExpressionParser.parse('4d6w3');

      expect(result.diceCount).toBe(4);
      expect(result.faces).toBe(6);
      expect(result.keepBest).toBeUndefined();
      expect(result.keepWorst).toBe(3);
    });

    it('should parse "4d6b3+2" (edge with modifier)', () => {
      const result = DiceExpressionParser.parse('4d6b3+2');

      expect(result.diceCount).toBe(4);
      expect(result.faces).toBe(6);
      expect(result.keepBest).toBe(3);
      expect(result.operations).toEqual([{ operator: '+', value: 2 }]);
    });

    it('should parse "4d6w3-1" (burden with modifier)', () => {
      const result = DiceExpressionParser.parse('4d6w3-1');

      expect(result.diceCount).toBe(4);
      expect(result.faces).toBe(6);
      expect(result.keepWorst).toBe(3);
      expect(result.operations).toEqual([{ operator: '-', value: 1 }]);
    });

    it('should parse case-insensitive "4D6B3"', () => {
      const result = DiceExpressionParser.parse('4D6B3');

      expect(result.keepBest).toBe(3);
    });
  });

  describe('parse() - PEMDAS operations', () => {
    it('should parse "3d6x2" (multiplication)', () => {
      const result = DiceExpressionParser.parse('3d6x2');

      expect(result.diceCount).toBe(3);
      expect(result.faces).toBe(6);
      expect(result.operations).toEqual([{ operator: '*', value: 2 }]);
    });

    it('should parse "2d6/2" (division)', () => {
      const result = DiceExpressionParser.parse('2d6/2');

      expect(result.diceCount).toBe(2);
      expect(result.faces).toBe(6);
      expect(result.operations).toEqual([{ operator: '/', value: 2 }]);
    });

    it('should parse "3d6x2+1" (multiply then add)', () => {
      const result = DiceExpressionParser.parse('3d6x2+1');

      expect(result.diceCount).toBe(3);
      expect(result.faces).toBe(6);
      expect(result.operations).toEqual([
        { operator: '*', value: 2 },
        { operator: '+', value: 1 },
      ]);
    });

    it('should parse "2d20+5x3-2" (complex)', () => {
      const result = DiceExpressionParser.parse('2d20+5x3-2');

      expect(result.diceCount).toBe(2);
      expect(result.faces).toBe(20);
      expect(result.operations).toEqual([
        { operator: '+', value: 5 },
        { operator: '*', value: 3 },
        { operator: '-', value: 2 },
      ]);
    });

    it('should parse "4d6/2+1-3" (division, addition, subtraction)', () => {
      const result = DiceExpressionParser.parse('4d6/2+1-3');

      expect(result.operations).toEqual([
        { operator: '/', value: 2 },
        { operator: '+', value: 1 },
        { operator: '-', value: 3 },
      ]);
    });
  });

  describe('parse() - Combined features', () => {
    it('should parse "4d6b3+2-1" (edge with multiple modifiers)', () => {
      const result = DiceExpressionParser.parse('4d6b3+2-1');

      expect(result.diceCount).toBe(4);
      expect(result.faces).toBe(6);
      expect(result.keepBest).toBe(3);
      expect(result.operations).toEqual([
        { operator: '+', value: 2 },
        { operator: '-', value: 1 },
      ]);
    });

    it('should parse "4d6w3x2" (burden with multiplication)', () => {
      const result = DiceExpressionParser.parse('4d6w3x2');

      expect(result.diceCount).toBe(4);
      expect(result.faces).toBe(6);
      expect(result.keepWorst).toBe(3);
      expect(result.operations).toEqual([{ operator: '*', value: 2 }]);
    });
  });

  describe('parse() - Error handling', () => {
    it('should throw on empty expression', () => {
      expect(() => DiceExpressionParser.parse('')).toThrow('Expression cannot be empty');
    });

    it('should throw on invalid format', () => {
      expect(() => DiceExpressionParser.parse('invalid')).toThrow('Invalid dice notation');
    });

    it('should throw on missing dice notation', () => {
      expect(() => DiceExpressionParser.parse('2+2')).toThrow('Invalid dice notation');
    });

    it('should throw on both keep best and worst', () => {
      expect(() => DiceExpressionParser.parse('4d6b3w2')).toThrow('Cannot specify both keep best (b) and keep worst (w)');
    });

    it('should throw on invalid operation format', () => {
      expect(() => DiceExpressionParser.parse('2d6++')).toThrow('Invalid operations format');
    });

    it('should throw on invalid operator', () => {
      // Parser shouldn't let through invalid operators
      expect(() => DiceExpressionParser.parse('2d6%2')).toThrow();
    });
  });

  describe('validate() - Parameter validation', () => {
    it('should pass validation for valid params', () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        operations: [{ operator: '+', value: 2 }],
      };

      expect(() => DiceExpressionParser.validate(params)).not.toThrow();
    });

    it('should throw on diceCount < 1', () => {
      const params: DiceRollParams = {
        diceCount: 0,
        faces: 6,
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('diceCount must be at least 1');
    });

    it('should throw on faces < 2', () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 1,
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('faces must be at least 2');
    });

    it('should throw on both keepBest and keepWorst', () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
        keepWorst: 3,
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('Cannot specify both keepBest and keepWorst');
    });

    it('should throw when keepBest > diceCount', () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        keepBest: 5,
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('keepBest (5) cannot be greater than diceCount (2)');
    });

    it('should throw when keepWorst > diceCount', () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        keepWorst: 5,
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('keepWorst (5) cannot be greater than diceCount (2)');
    });

    it('should throw on division by zero', () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        operations: [{ operator: '/', value: 0 }],
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('Division by zero is not allowed');
    });

    it('should throw on invalid operator', () => {
      const params: any = {
        diceCount: 2,
        faces: 6,
        operations: [{ operator: '%', value: 2 }],
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('Invalid operator');
    });

    it('should throw on negative operation value', () => {
      const params: any = {
        diceCount: 2,
        faces: 6,
        operations: [{ operator: '+', value: -1 }],
      };

      expect(() => DiceExpressionParser.validate(params)).toThrow('Invalid operation value');
    });
  });

  describe('stringify() - Convert params to expression', () => {
    it('should stringify basic params', () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 20,
      };

      const result = DiceExpressionParser.stringify(params);
      expect(result).toBe('2d20');
    });

    it('should stringify with operations', () => {
      const params: DiceRollParams = {
        diceCount: 3,
        faces: 6,
        operations: [{ operator: '+', value: 2 }],
      };

      const result = DiceExpressionParser.stringify(params);
      expect(result).toBe('3d6+2');
    });

    it('should stringify with keepBest', () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
      };

      const result = DiceExpressionParser.stringify(params);
      expect(result).toBe('4d6b3');
    });

    it('should stringify with keepWorst', () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepWorst: 3,
      };

      const result = DiceExpressionParser.stringify(params);
      expect(result).toBe('4d6w3');
    });

    it('should use "x" for multiplication', () => {
      const params: DiceRollParams = {
        diceCount: 3,
        faces: 6,
        operations: [{ operator: '*', value: 2 }],
      };

      const result = DiceExpressionParser.stringify(params);
      expect(result).toBe('3d6x2');
    });

    it('should stringify complex expression', () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
        operations: [
          { operator: '+', value: 2 },
          { operator: '-', value: 1 },
        ],
      };

      const result = DiceExpressionParser.stringify(params);
      expect(result).toBe('4d6b3+2-1');
    });
  });

  describe('Round-trip: parse -> stringify', () => {
    const testExpressions = ['2d20', 'd6', '3d6+2', '4d6b3', '4d6w3', '4d6b3+2', '3d6x2', '2d20+5x3-2'];

    testExpressions.forEach((expr) => {
      it(`should round-trip "${expr}"`, () => {
        const params = DiceExpressionParser.parse(expr);
        const stringified = DiceExpressionParser.stringify(params);

        // Parse again to compare params
        const reparsed = DiceExpressionParser.parse(stringified);

        expect(reparsed).toEqual(params);
      });
    });
  });
});

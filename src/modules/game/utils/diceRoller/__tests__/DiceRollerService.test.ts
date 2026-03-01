/**
 * Tests for DiceRollerService
 */

import DiceRollerService from '../DiceRollerService';
import { DiceRollParams } from '../types/DiceRollerTypes';

describe('DiceRollerService', () => {
  let roller: DiceRollerService;

  beforeEach(() => {
    roller = new DiceRollerService();
  });

  describe('roll() - Basic rolls', () => {
    it('should roll 2d20 and return two dice values', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 20,
      };

      const result = await roller.roll(params);

      expect(result.rolls).toHaveLength(2);
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeLessThanOrEqual(40);
      expect(result.faces).toBe(20);
      expect(result.modifier).toBe(0);
      result.rolls.forEach((roll) => {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(20);
      });
    });

    it('should roll 3d6 with +2 modifier', async () => {
      const params: DiceRollParams = {
        diceCount: 3,
        faces: 6,
        operations: [{ operator: '+', value: 2 }],
      };

      const result = await roller.roll(params);

      expect(result.rolls).toHaveLength(3);
      expect(result.modifier).toBe(2);
      // Total should be sum of rolls + modifier
      const expectedTotal = result.rolls.reduce((sum, roll) => sum + roll, 0) + 2;
      expect(result.total).toBe(expectedTotal);
    });

    it('should roll 1d10 with -1 modifier', async () => {
      const params: DiceRollParams = {
        diceCount: 1,
        faces: 10,
        operations: [{ operator: '-', value: 1 }],
      };

      const result = await roller.roll(params);

      expect(result.rolls).toHaveLength(1);
      expect(result.modifier).toBe(-1);
      const expectedTotal = result.rolls[0] - 1;
      expect(result.total).toBe(expectedTotal);
    });

    it('should handle single die notation (d6)', async () => {
      const params: DiceRollParams = {
        diceCount: 1,
        faces: 6,
      };

      const result = await roller.roll(params);

      expect(result.rolls).toHaveLength(1);
      expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[0]).toBeLessThanOrEqual(6);
      expect(result.total).toBe(result.rolls[0]);
    });

    it('should handle multiple operations (+2-1)', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        operations: [
          { operator: '+', value: 2 },
          { operator: '-', value: 1 },
        ],
      };

      const result = await roller.roll(params);

      expect(result.modifier).toBe(1); // +2 -1 = 1
      const expectedTotal = result.rolls.reduce((sum, roll) => sum + roll, 0) + 1;
      expect(result.total).toBe(expectedTotal);
    });
  });

  describe('rollAdvanced() - Edge/Burden mechanics', () => {
    it('should keep best 3 of 4d6 (edge mechanic)', async () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
      };

      const result = await roller.rollAdvanced(params);

      expect(result.allRolls).toHaveLength(4);
      expect(result.keptRolls).toHaveLength(3);
      expect(result.expression).toBe('4d6b3');

      // Verify kept rolls are the highest 3
      const sortedAll = [...result.allRolls].sort((a, b) => b - a);
      expect(result.keptRolls.sort((a, b) => b - a)).toEqual(sortedAll.slice(0, 3));

      // Total should be sum of kept rolls
      const expectedTotal = result.keptRolls.reduce((sum, roll) => sum + roll, 0);
      expect(result.total).toBe(expectedTotal);
    });

    it('should keep worst 3 of 4d6 (burden mechanic)', async () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepWorst: 3,
      };

      const result = await roller.rollAdvanced(params);

      expect(result.allRolls).toHaveLength(4);
      expect(result.keptRolls).toHaveLength(3);
      expect(result.expression).toBe('4d6w3');

      // Verify kept rolls are the lowest 3
      const sortedAll = [...result.allRolls].sort((a, b) => a - b);
      expect(result.keptRolls.sort((a, b) => a - b)).toEqual(sortedAll.slice(0, 3));

      // Total should be sum of kept rolls
      const expectedTotal = result.keptRolls.reduce((sum, roll) => sum + roll, 0);
      expect(result.total).toBe(expectedTotal);
    });

    it('should apply edge with modifiers (4d6b3+2)', async () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
        operations: [{ operator: '+', value: 2 }],
      };

      const result = await roller.rollAdvanced(params);

      expect(result.keptRolls).toHaveLength(3);
      expect(result.expression).toBe('4d6b3+2');

      const expectedTotal = result.keptRolls.reduce((sum, roll) => sum + roll, 0) + 2;
      expect(result.total).toBe(expectedTotal);
      expect(result.breakdown).toContain('+2');
    });

    it('should apply burden with modifiers (4d6w3-1)', async () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepWorst: 3,
        operations: [{ operator: '-', value: 1 }],
      };

      const result = await roller.rollAdvanced(params);

      expect(result.keptRolls).toHaveLength(3);
      expect(result.expression).toBe('4d6w3-1');

      const expectedTotal = result.keptRolls.reduce((sum, roll) => sum + roll, 0) - 1;
      expect(result.total).toBe(expectedTotal);
      expect(result.breakdown).toContain('-1');
    });
  });

  describe('rollAdvanced() - PEMDAS operations', () => {
    it('should apply multiplication before addition (3d6x2+1)', async () => {
      const params: DiceRollParams = {
        diceCount: 3,
        faces: 6,
        operations: [
          { operator: '*', value: 2 },
          { operator: '+', value: 1 },
        ],
      };

      const result = await roller.rollAdvanced(params);

      expect(result.expression).toBe('3d6x2+1');

      const baseTotal = result.allRolls.reduce((sum, roll) => sum + roll, 0);
      const expectedTotal = baseTotal * 2 + 1;
      expect(result.total).toBe(expectedTotal);
    });

    it('should apply division before subtraction (2d6/2-1)', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        operations: [
          { operator: '/', value: 2 },
          { operator: '-', value: 1 },
        ],
      };

      const result = await roller.rollAdvanced(params);

      const baseTotal = result.allRolls.reduce((sum, roll) => sum + roll, 0);
      const expectedTotal = Math.floor(baseTotal / 2) - 1;
      expect(result.total).toBe(expectedTotal);
    });

    it('should handle complex PEMDAS (2d20+5x3-2)', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 20,
        operations: [
          { operator: '+', value: 5 },
          { operator: '*', value: 3 },
          { operator: '-', value: 2 },
        ],
      };

      const result = await roller.rollAdvanced(params);

      const baseTotal = result.allRolls.reduce((sum, roll) => sum + roll, 0);
      // PEMDAS: multiply first, then add/subtract left to right
      // Since we have baseTotal + 5 * 3 - 2
      // Multiplication happens first on the base value
      const expectedTotal = baseTotal * 3 + 5 - 2;
      expect(result.total).toBe(expectedTotal);
    });

    it('should handle division by zero gracefully', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        operations: [{ operator: '/', value: 0 }],
      };

      const result = await roller.rollAdvanced(params);

      // Division by zero should be skipped
      const baseTotal = result.allRolls.reduce((sum, roll) => sum + roll, 0);
      expect(result.total).toBe(baseTotal);
    });
  });

  describe('Parameter validation', () => {
    it('should reject diceCount < 1', async () => {
      const params: DiceRollParams = {
        diceCount: 0,
        faces: 6,
      };

      const result = await roller.roll(params);
      expect(result.rolls).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should reject faces < 2', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 1,
      };

      const result = await roller.roll(params);
      expect(result.rolls).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should reject keepBest > diceCount', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        keepBest: 5,
      };

      const result = await roller.rollAdvanced(params);
      expect(result.allRolls).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should reject both keepBest and keepWorst', async () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
        keepWorst: 3,
      };

      const result = await roller.rollAdvanced(params);
      expect(result.allRolls).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('Breakdown generation', () => {
    it('should include breakdown for edge rolls', async () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
      };

      const result = await roller.rollAdvanced(params);

      expect(result.breakdown).toContain('Rolled:');
      expect(result.breakdown).toContain('Kept:');
      expect(result.breakdown).toContain('→');
    });

    it('should not show kept/rolled separation for no-keep rolls', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
      };

      const result = await roller.rollAdvanced(params);

      expect(result.breakdown).toContain('Rolled:');
      expect(result.breakdown).not.toContain('Kept:');
    });

    it('should show operations in breakdown', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
        operations: [
          { operator: '+', value: 2 },
          { operator: '-', value: 1 },
        ],
      };

      const result = await roller.rollAdvanced(params);

      expect(result.breakdown).toContain('+2');
      expect(result.breakdown).toContain('-1');
    });
  });

  describe('Expression generation', () => {
    it('should generate correct expression for basic roll', async () => {
      const params: DiceRollParams = {
        diceCount: 2,
        faces: 20,
      };

      const result = await roller.rollAdvanced(params);
      expect(result.expression).toBe('2d20');
    });

    it('should use "x" for multiplication in expression', async () => {
      const params: DiceRollParams = {
        diceCount: 3,
        faces: 6,
        operations: [{ operator: '*', value: 2 }],
      };

      const result = await roller.rollAdvanced(params);
      expect(result.expression).toBe('3d6x2');
    });

    it('should combine all elements in expression', async () => {
      const params: DiceRollParams = {
        diceCount: 4,
        faces: 6,
        keepBest: 3,
        operations: [
          { operator: '+', value: 2 },
          { operator: '-', value: 1 },
        ],
      };

      const result = await roller.rollAdvanced(params);
      expect(result.expression).toBe('4d6b3+2-1');
    });
  });

  describe('Simulated roll fallback', () => {
    it('should work without RANDOM_ORG_API_KEY', async () => {
      // Temporarily remove API key
      const originalKey = process.env.RANDOM_ORG_API_KEY;
      delete process.env.RANDOM_ORG_API_KEY;

      const params: DiceRollParams = {
        diceCount: 2,
        faces: 6,
      };

      const result = await roller.roll(params);

      expect(result.rolls).toHaveLength(2);
      result.rolls.forEach((roll) => {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      });

      // Restore API key
      if (originalKey) {
        process.env.RANDOM_ORG_API_KEY = originalKey;
      }
    });
  });
});

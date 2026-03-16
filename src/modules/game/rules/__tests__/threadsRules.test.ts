/**
 * Tests for threads range enforcement
 */

import { enforceThreadsRange } from '../resources/threadsRules';
import { CharacterRuleData, THREADS_MIN, THREADS_MAX } from '../types/RuleTypes';

describe('Threads Rules', () => {
  describe('enforceThreadsRange', () => {
    it('should clamp threads.max to 5', () => {
      const character: CharacterRuleData = {
        aspects: {
          might: { strength: 0, presence: 0 },
          finesse: { agility: 0, charm: 0 },
          wit: { instinct: 0, knowledge: 0 },
          resolve: { willpower: 0, empathy: 0 },
        },
        hp: { current: 12, max: 12 },
        threads: { current: 3, max: 10 },
      };

      enforceThreadsRange(character);
      expect(character.threads.max).toBe(THREADS_MAX);
    });

    it('should clamp threads.current to 5', () => {
      const character: CharacterRuleData = {
        aspects: {
          might: { strength: 0, presence: 0 },
          finesse: { agility: 0, charm: 0 },
          wit: { instinct: 0, knowledge: 0 },
          resolve: { willpower: 0, empathy: 0 },
        },
        hp: { current: 12, max: 12 },
        threads: { current: 8, max: 5 },
      };

      enforceThreadsRange(character);
      expect(character.threads.current).toBe(THREADS_MAX);
    });

    it('should clamp threads.temp to 5', () => {
      const character: CharacterRuleData = {
        aspects: {
          might: { strength: 0, presence: 0 },
          finesse: { agility: 0, charm: 0 },
          wit: { instinct: 0, knowledge: 0 },
          resolve: { willpower: 0, empathy: 0 },
        },
        hp: { current: 12, max: 12 },
        threads: { current: 3, max: 5, temp: 15 },
      };

      enforceThreadsRange(character);
      expect(character.threads.temp).toBe(THREADS_MAX);
    });

    it('should enforce minimum value of 0', () => {
      const character: CharacterRuleData = {
        aspects: {
          might: { strength: 0, presence: 0 },
          finesse: { agility: 0, charm: 0 },
          wit: { instinct: 0, knowledge: 0 },
          resolve: { willpower: 0, empathy: 0 },
        },
        hp: { current: 12, max: 12 },
        threads: { current: -5, max: -2 },
      };

      enforceThreadsRange(character);
      expect(character.threads.current).toBe(0);
      expect(character.threads.max).toBe(3); // enforces the minimum max
    });

    it('should not modify valid thread values', () => {
      const character: CharacterRuleData = {
        aspects: {
          might: { strength: 0, presence: 0 },
          finesse: { agility: 0, charm: 0 },
          wit: { instinct: 0, knowledge: 0 },
          resolve: { willpower: 0, empathy: 0 },
        },
        hp: { current: 12, max: 12 },
        threads: { current: 3, max: 5, temp: 2 },
      };

      enforceThreadsRange(character);
      expect(character.threads.current).toBe(3);
      expect(character.threads.max).toBe(5);
      expect(character.threads.temp).toBe(2);
    });

    it('should initialize missing threads object', () => {
      const character: any = {
        aspects: {
          might: { strength: 0, presence: 0 },
          finesse: { agility: 0, charm: 0 },
          wit: { instinct: 0, knowledge: 0 },
          resolve: { willpower: 0, empathy: 0 },
        },
        hp: { current: 12, max: 12 },
      };

      enforceThreadsRange(character);
      expect(character.threads).toBeDefined();
      expect(character.threads.max).toBe(THREADS_MAX);
      expect(character.threads.current).toBe(THREADS_MAX);
    });
  });
});

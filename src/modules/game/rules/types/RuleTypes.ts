/**
 * Type definitions for game rule enforcement
 */

/**
 * Aspect family names in the game system
 */
export type AspectFamily = 'might' | 'finesse' | 'wit' | 'resolve';

/**
 * Sub-aspect names for each family
 */
export type SubAspect = 'strength' | 'presence' | 'agility' | 'charm' | 'instinct' | 'knowledge' | 'willpower' | 'empathy';

/**
 * Resource track structure
 */
export interface ResourceTrack {
  current: number;
  max: number;
  temp?: number;
}

/**
 * Aspect family structure with two sub-aspects
 */
export interface AspectPair {
  [key: string]: number;
}

/**
 * Character aspects structure
 */
export interface CharacterAspects {
  might: {
    strength: number;
    presence: number;
  };
  finesse: {
    agility: number;
    charm: number;
  };
  wit: {
    instinct: number;
    knowledge: number;
  };
  resolve: {
    willpower: number;
    empathy: number;
  };
  extra?: Map<string, number>;
}

/**
 * Character data subset needed for rule enforcement
 */
export interface CharacterRuleData {
  aspects: CharacterAspects;
  hp: ResourceTrack;
  threads: ResourceTrack;
  resolve?: ResourceTrack;
  [key: string]: any; // Allow other properties to pass through
}

/**
 * Game rule constants
 */
export const ASPECT_MIN = -2;
export const ASPECT_MAX = 4;
export const THREADS_MIN = 3;
export const THREADS_MAX = 5;
export const BASE_HP = 12;

/**
 * Validation error details
 */
export interface RuleViolation {
  field: string;
  value: number;
  expectedRange: { min: number; max: number };
  message: string;
}

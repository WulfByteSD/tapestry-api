/**
 * @description Calculate the DTN (Defense Toughness Number) for a given character.
 *              DTN is calculated as a base of 10 + best of the character's aspects (might, speed, intellect).
 *              Value is dynamic and can change as the character's aspects change.
 *
 * @param character - The character for whom to calculate the DTN
 */
import { CharacterRuleData } from '../types/RuleTypes';
export default function (character: CharacterRuleData): void {
  const aspects = character.aspects;
  const bestAspectValue = Math.max(aspects.might.strength, aspects.finesse.agility, aspects.resolve.willpower);
  character.dtn = 10 + bestAspectValue;
}

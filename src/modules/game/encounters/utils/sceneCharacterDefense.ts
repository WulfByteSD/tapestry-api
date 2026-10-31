import calculateCharacterProtection from '../../rules/combat/calculateCharacterProtection';

/** Canonical scene Defense TN: 10 + best defensive Aspect + equipped Armor. */
export function sceneCharacterDefense(character: any): number {
  const aspects = character.sheet.aspects;
  return 10 + Math.max(Number(aspects.might?.strength ?? 0), Number(aspects.finesse?.agility ?? 0), Number(aspects.resolve?.willpower ?? 0)) + calculateCharacterProtection(character);
}

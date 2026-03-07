import { CharacterType } from "../../characters/model/CharacterModel";

export default function(character: CharacterType): number {
  // Base protection from armor items in inventory
  const baseProtection = character.sheet.inventory.reduce((total, item) => {
    return item.equipped ? total + (item.protection || 0) : total;
  }, 0);
  
  return baseProtection + (character.sheet.resources.other.armor || 0);
}
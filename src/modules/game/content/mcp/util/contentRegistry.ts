import mongoose from 'mongoose';
import ItemModel from '../../model/ItemDefinitionModel';
import { SkillDefinitionModel } from '../../model/SkillDefinition';
import AbilityModel from '../../model/AbilityDefinitionModel';
import SettingModel from '../../model/SettingModel';
import LoreModel from '../../model/LoreNodeModel';
import CombatantModel from '../../model/CombatantModel';
import { ContentType } from '../types/McpTypes';

export const contentModels: Record<ContentType, mongoose.Model<any>> = {
  items: ItemModel,
  skills: SkillDefinitionModel,
  abilities: AbilityModel,
  settings: SettingModel,
  lore: LoreModel,
  combatants: CombatantModel,
};

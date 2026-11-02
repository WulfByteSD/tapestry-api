import mongoose from 'mongoose';
import Item from '../model/ItemDefinitionModel';
import Combatant from '../model/CombatantModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';

export async function validateLinkedContent(settingKey: string, links: unknown) {
  if (!Array.isArray(links)) throw new ErrorUtil('Linked content must be a list.', 400);
  for (const link of links) {
    if (!link || !['item', 'combatant'].includes(link.type) || !mongoose.isValidObjectId(link.targetId)) throw new ErrorUtil('Invalid linked content reference.', 400);
    const model: mongoose.Model<any> = link.type === 'item' ? Item : Combatant;
    const settings = link.type === 'item' ? [settingKey, 'shared'] : [settingKey];
    if (!(await model.exists({ _id: link.targetId, settingKeys: { $in: settings }, status: { $ne: 'archived' } }))) throw new ErrorUtil('Linked content must exist in this setting (or be a shared item).', 400);
  }
}

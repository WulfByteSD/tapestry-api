import Combatant from '../../content/model/CombatantModel';
import { AdventureContent } from '../types/adventure.contracts';

/** Resolve recommendations without modifying stored module references or other content. */
export default class AdventureCombatantsHandler {
  async resolve<T extends AdventureContent>(content: T): Promise<T> {
    const ids = [...new Set(content.encounters.flatMap(encounter => encounter.combatants.map(entry => entry.combatantId)))];
    if (!ids.length) return content;
    const records = await Combatant.find({ _id: { $in: ids }, status: { $ne: 'archived' } }).select('_id').lean();
    const available = new Set(records.map(record => String(record._id)));
    return { ...content, encounters: content.encounters.map(encounter => ({ ...encounter,
      combatants: encounter.combatants.filter(entry => available.has(entry.combatantId)),
    })) };
  }
}

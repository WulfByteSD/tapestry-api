import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import Setting from '../model/SettingModel';
import LoreNode from '../model/LoreNodeModel';

/** Validate newly selected references without erasing historical unavailable values. */
export default class CombatantReferencesHandler {
  async validate(data: Record<string, unknown>, previous?: { settingKeys?: string[]; loreNodeId?: unknown }) {
    if (data.settingKeys !== undefined) {
      if (!Array.isArray(data.settingKeys) || data.settingKeys.some(key => typeof key !== 'string')) throw new ErrorUtil('Select valid setting keys', 400);
      const added = [...new Set((data.settingKeys as string[]).filter(key => !previous?.settingKeys?.includes(key)))];
      if (added.length && await Setting.countDocuments({ key: { $in: added }, status: { $ne: 'archived' } }) !== added.length)
        throw new ErrorUtil('A selected setting is no longer available. Reload the settings and choose an existing one.', 400);
    }
    if (data.loreNodeId && String(data.loreNodeId) !== String(previous?.loreNodeId ?? '')) {
      if (!mongoose.isValidObjectId(data.loreNodeId) || !(await LoreNode.exists({ _id: data.loreNodeId, status: { $ne: 'archived' } })))
        throw new ErrorUtil('The selected lore node is no longer available. Search for another node.', 400);
    }
  }
}

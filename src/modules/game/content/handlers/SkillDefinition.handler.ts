import { CRUDHandler } from '../../../../utils/baseCRUD'; 
import { SkillDefinitionModel, SkillDefinitionType } from '../model/SkillDefinition';

const SHARED_SETTING_KEY = 'shared';

export default class SkillDefinitionHandler extends CRUDHandler<SkillDefinitionType> {
  constructor() {
    super(SkillDefinitionModel);
  }

  async fetchByKey(key: string) {
    return await this.Schema.findOne({
      key,
      status: { $ne: 'archived' },
    }).lean();
  }

  async fetchBySettingKey(settingKey: string, category?: string) {
    const filters: Record<string, any> = {
      settingKeys: { $in: [settingKey, SHARED_SETTING_KEY] },
      status: 'published',
    };

    if (category) {
      filters.category = category;
    }

    return await this.Schema.find(filters).sort({ category: 1, name: 1 }).lean();
  }
}

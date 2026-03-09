import { CRUDHandler } from '../../../../utils/baseCRUD';
import AbilityDefinitionModel, { AbilityDefinitionType } from '../model/AbilityDefinitionModel';

export default class AbilityDefinitionHandler extends CRUDHandler<AbilityDefinitionType> {
  constructor() {
    super(AbilityDefinitionModel);
  }

  async fetchByKey(key: string) {
    return await this.Schema.findOne({
      key,
      status: { $ne: 'archived' },
    }).lean();
  }

  async fetchBySettingKey(settingKey: string, category?: string) {
    const filters: Record<string, any> = {
      settingKeys: { $in: [settingKey] },
      status: 'published',
    };

    if (category) {
      filters.category = category;
    }

    return await this.Schema.find(filters).sort({ category: 1, name: 1 }).lean();
  }
}

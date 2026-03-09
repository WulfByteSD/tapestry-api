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

  async fetchBySettingKey(settingKey: string, category?: string, sourceType?: string) {
    const filters: Record<string, any> = {
      settingKeys: { $in: [settingKey] },
      status: 'published',
    };

    if (category) {
      filters.category = category;
    }

    if (sourceType) {
      // sourceType can be multiple values seperated by comma, so we need to split it into an array
      const sourceTypes = sourceType.split(',').map((s) => s.trim());
      filters.sourceType = { $in: sourceTypes };
    }

    return await this.Schema.find(filters).sort({ category: 1, name: 1 }).lean();
  }
}

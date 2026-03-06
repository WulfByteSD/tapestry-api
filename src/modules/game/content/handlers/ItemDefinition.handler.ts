import { CRUDHandler } from '../../../../utils/baseCRUD';
import ItemDefinitionModel, { ItemDefinitionType } from '../model/ItemDefinitionModel';

export default class ItemDefinitionHandler extends CRUDHandler<ItemDefinitionType> {
  constructor() {
    super(ItemDefinitionModel);
  }

  async fetchByKey(key: string) {
    return await ItemDefinitionModel.findOne({
      key,
      status: { $ne: 'archived' },
    }).lean();
  }

  async fetchBySettingKey(settingKey: string, category?: string) {
    const filters: Record<string, any> = {
      settingKey,
      status: 'published',
    };

    if (category) {
      filters.category = category;
    }

    return await ItemDefinitionModel.find(filters).sort({ category: 1, name: 1 }).lean();
  }
}

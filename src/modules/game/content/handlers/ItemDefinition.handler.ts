import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDHandler } from '../../../../utils/baseCRUD';
import ItemDefinitionModel, { ItemDefinitionType, ItemScope } from '../model/ItemDefinitionModel';
import normalizeCreateInput from '../util/normalizeCreateInput';

const SHARED_SETTING_KEY = 'shared';

export type ItemCreateInput = {
  key?: string;
  name?: string;
  scope?: ItemScope;
  settingKeys?: string[];

  category?: string;
  status?: string;
  tags?: string[];
  equippable?: boolean;
  slot?: string | null;
  stackable?: boolean;
  notes?: string;
  attackProfiles?: any[];
  protection?: number;
};

export default class ItemDefinitionHandler extends CRUDHandler<ItemDefinitionType> {
  constructor() {
    super(ItemDefinitionModel);
  }
  async create(data: ItemCreateInput): Promise<ItemDefinitionType> {
    const normalized = normalizeCreateInput(data);

    const existing = await this.Schema.findOne({ key: normalized.key }).lean();
    if (existing) {
      throw new ErrorUtil(`Item key "${normalized.key}" already exists`, 409);
    }

    return await super.create(normalized);
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

    console.log(filters);

    if (category) {
      filters.category = category;
    }

    return await this.Schema.find(filters).sort({ category: 1, name: 1 }).lean();
  }
}

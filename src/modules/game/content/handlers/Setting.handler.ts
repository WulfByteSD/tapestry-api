import { CRUDHandler } from '../../../../utils/baseCRUD';
import SettingModel, { SettingType } from '../model/SettingModel';

export default class SettingHandler extends CRUDHandler<SettingType> {
  constructor() {
    super(SettingModel);
  }

  async fetchByKey(key: string) {
    return await SettingModel.findOne({
      key,
      status: { $ne: 'archived' },
    }).lean();
  }
}

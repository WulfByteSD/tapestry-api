import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import ItemDefinitionHandler from '../handlers/ItemDefinition.handler';

export default class ItemsService extends CRUDService {
  private itemHandler: ItemDefinitionHandler;

  constructor() {
    super(ItemDefinitionHandler);
    this.itemHandler = this.handler as ItemDefinitionHandler;
    this.queryKeys = ['key', 'name', 'notes', 'tags', 'category', 'settingKeys'];
    this.requiresAuth = {
      getResources: true,
      getResource: true,
      // create/update/delete deliberately not exposed yet
    };
  }

  getItemByKey = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await this.itemHandler.fetchByKey(req.params.key);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Item not found',
        });
      }

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  getItemsForSetting = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { settingKey } = req.params;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;

      const result = await this.itemHandler.fetchBySettingKey(settingKey, category);

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });
}

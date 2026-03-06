import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import SettingHandler from '../handlers/Setting.handler';

export default class SettingsService extends CRUDService {
  private settingHandler: SettingHandler;

  constructor() {
    super(SettingHandler);
    this.settingHandler = this.handler as SettingHandler;

    this.queryKeys = ['key', 'name', 'description', 'tags'];

    this.requiresAuth = {
      getResources: true,
      getResource: true,
      // create/update/delete deliberately not exposed yet
    };
  }

  getSettingByKey = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await this.settingHandler.fetchByKey(req.params.key);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Setting not found',
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
}

import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import LoreHandler from '../handlers/Lore.handler';

export default class LoreService extends CRUDService {
  private loreHandler: LoreHandler;

  constructor() {
    super(LoreHandler);
    this.loreHandler = this.handler as LoreHandler;

    this.queryKeys = ['key', 'name', 'summary', 'body', 'tags', 'kind', 'settingKey', 'status'];

    this.requiresAuth = {
      getResources: true,
      getResource: true,
      create: true,
      updateResource: true,
      removeResource: true,
    };
  }

  /**
   * Get lore tree for a specific setting
   * GET /tree/:settingKey
   */
  getTreeForSetting = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { settingKey } = req.params;

      // TODO: Implement tree structure logic
      const result = await this.loreHandler.fetchTreeForSetting(settingKey);

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  /**
   * Get children nodes for a specific parent
   * GET /children/:parentId
   */
  getChildrenForNode = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { parentId } = req.params;

      // TODO: Implement children fetching logic
      const result = await this.loreHandler.fetchChildrenForNode(parentId);

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  /**
   * Get a lore node by setting key and node key
   * GET /by-key/:settingKey/:key
   */
  getBySettingAndKey = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { settingKey, key } = req.params;

      // TODO: Implement fetch by setting and key logic
      const result = await this.loreHandler.fetchBySettingAndKey(settingKey, key);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Lore node not found',
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

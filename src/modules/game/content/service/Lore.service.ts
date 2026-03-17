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
   * GET /tree/:settingKey
   */
  getTreeForSetting = asyncHandler(async (req: Request, res: Response) => {
    try {
      const settingKey = String(req.params.settingKey || '').trim();

      if (!settingKey) {
        return res.status(400).json({
          success: false,
          message: 'settingKey is required',
        });
      }

      const result = await this.loreHandler.fetchTreeForSetting(settingKey);

      return res.status(200).json({
        success: true,
        payload: result,
        metadata: {
          rootCount: result.length,
        },
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  /**
   * GET /children/:parentId
   */
  getChildrenForNode = asyncHandler(async (req: Request, res: Response) => {
    try {
      const parentId = String(req.params.parentId || '').trim();

      if (!parentId) {
        return res.status(400).json({
          success: false,
          message: 'parentId is required',
        });
      }

      const result = await this.loreHandler.fetchChildrenForNode(parentId);

      return res.status(200).json({
        success: true,
        payload: result,
        metadata: {
          childCount: result.length,
        },
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  /**
   * GET /by-key/:settingKey/:key
   */
  getBySettingAndKey = asyncHandler(async (req: Request, res: Response) => {
    try {
      const settingKey = String(req.params.settingKey || '').trim();
      const key = String(req.params.key || '').trim();

      if (!settingKey || !key) {
        return res.status(400).json({
          success: false,
          message: 'settingKey and key are required',
        });
      }

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

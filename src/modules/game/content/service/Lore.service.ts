import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import LoreHandler from '../handlers/Lore.handler';
import LoreTreeHandler from '../handlers/LoreTree.handler';

export default class LoreService extends CRUDService {
  private loreTreeHandler: LoreTreeHandler;

  constructor() {
    super(LoreHandler);
    this.loreTreeHandler = new LoreTreeHandler();

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
   * GET /context/:id?descendantDepth=2
   */
  getFocusedContext = asyncHandler(async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'id is required',
        });
      }

      const rawDepth = Number(req.query.descendantDepth ?? 2);
      const descendantDepth = Number.isFinite(rawDepth) ? Math.max(1, Math.min(3, Math.floor(rawDepth))) : 2;

      const result = await this.loreTreeHandler.fetchFocusedContext(id, descendantDepth);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Lore node not found',
        });
      }

      return res.status(200).json({
        success: true,
        payload: result,
        metadata: {
          descendantDepth,
          focusId: id,
        },
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });
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

      const result = await this.loreTreeHandler.fetchTreeForSetting(settingKey);

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

      const result = await this.loreTreeHandler.fetchChildrenForNode(parentId);

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

      const result = await this.loreTreeHandler.fetchBySettingAndKey(settingKey, key);

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

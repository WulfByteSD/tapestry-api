import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import LinkedContentHandler from '../handlers/LinkedContent.handler';

export default class LinkedContentService extends CRUDService {
  constructor() {
    super(LinkedContentHandler as any);

    this.requiresAuth = {
      create: true,
      updateResource: true,
      removeResource: true,
    };
  }

  searchLinkedOptions = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { type, settingKey, q: query } = req.query;

      if (typeof type !== 'string' || typeof settingKey !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'type and settingKey are required and must be strings',
        });
      }

      const results = await this.handler.searchLinkedOptions({ settingKey, query: String(query || '').trim() });

      return res.status(200).json({
        success: true,
        payload: results,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });
}

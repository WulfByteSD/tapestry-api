import { Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import error from '../../../../middleware/error';
import { StoryweaverHandler } from '../handler/Storyweaver.handler';

export class StoryweaverService {
  private storyweaverHandler: StoryweaverHandler;

  constructor() {
    this.storyweaverHandler = new StoryweaverHandler();
  }

  public becomeStoryweaver = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      const { officialLoreOptIn = false } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      const result = await this.storyweaverHandler.becomeStoryweaver(userId.toString(), officialLoreOptIn);

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

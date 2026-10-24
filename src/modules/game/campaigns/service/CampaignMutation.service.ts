import { Request, Response, NextFunction } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import CampaignMutationHandler from '../handlers/CampaignMutation.handler';

export default class CampaignMutationService {
  private readonly handler = new CampaignMutationHandler();

  authorize = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const userId = (req as any).user?._id;
    await this.handler.authorize(userId ? String(userId) : undefined, req.params.id);
    next();
  });
}

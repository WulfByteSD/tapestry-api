import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CampaignPlaySurfaceHandler from '../handlers/CampaignPlaySurface.handler';

export default class CampaignPlaySurfaceService {
  private readonly handler = new CampaignPlaySurfaceHandler();
  private endpoint(action: 'get' | 'save') {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try { return res.status(200).json({ success: true, payload: await this.handler[action](req) }); }
      catch (error) {
        return res.status(error instanceof ErrorUtil ? error.statusCode : 500).json({ success: false, message: error instanceof ErrorUtil ? error.message : 'Could not update the play surface. Try again shortly.' });
      }
    });
  }
  get = this.endpoint('get');
  save = this.endpoint('save');
}

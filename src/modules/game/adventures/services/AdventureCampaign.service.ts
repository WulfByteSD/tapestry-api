import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import { requestActor } from '../helpers/adventureHttp.helpers';
import AdventureSharingHandler from '../handlers/AdventureSharing.handler';
import { materialView } from '../helpers/adventure.helpers';

export default class AdventureCampaignService {
  private readonly handler = new AdventureSharingHandler();
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.sharedList(requestActor(req), req.params.campaignId);
    return res.json({ success: true, payload: result });
  });
  read = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.sharedRead(requestActor(req), req.params.campaignId, req.params.id, req.params.resourceId);
    return res.json({ success: true, payload: materialView(result) });
  });
  share = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.share(requestActor(req), req.params.campaignId, req.params.id, req.params.resourceId);
    return res.json({ success: true, payload: result });
  });
  unshare = asyncHandler(async (req: Request, res: Response) => {
    await this.handler.unshare(requestActor(req), req.params.campaignId, req.params.id, req.params.resourceId);
    return res.status(204).end();
  });
}

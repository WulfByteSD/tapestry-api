import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CampaignDiscordHandler from '../handlers/CampaignDiscord.handler';
import DiscordAccountHandler from '../handlers/DiscordAccount.handler';

export default class CampaignDiscordService {
  private readonly handler = new CampaignDiscordHandler();
  private readonly accountHandler = new DiscordAccountHandler();
  private accountEndpoint(action: 'get' | 'start' | 'complete' | 'requirement' | 'unlink') {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try { return res.status(200).json({ success: true, payload: await this.accountHandler[action](req) }); }
      catch (error) {
        return res.status(error instanceof ErrorUtil ? error.statusCode : 500).json({ success: false, message: error instanceof ErrorUtil ? error.message : 'Could not update your Discord account link. Try again shortly.' });
      }
    });
  }
  account = this.accountEndpoint('get');
  accountStart = this.accountEndpoint('start');
  accountComplete = this.accountEndpoint('complete');
  requirement = this.accountEndpoint('requirement');
  unlink = this.accountEndpoint('unlink');
  private endpoint(action: 'get' | 'start' | 'complete' | 'guilds' | 'channels' | 'save' | 'disconnect') {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try { return res.status(200).json({ success: true, payload: await this.handler[action](req) }); }
      catch (error) {
        return res.status(error instanceof ErrorUtil ? error.statusCode : 500).json({ success: false, message: error instanceof ErrorUtil ? error.message : 'Could not update the Discord connection. Try again shortly.' });
      }
    });
  }
  get = this.endpoint('get');
  start = this.endpoint('start');
  complete = this.endpoint('complete');
  guilds = this.endpoint('guilds');
  channels = this.endpoint('channels');
  save = this.endpoint('save');
  disconnect = this.endpoint('disconnect');
}

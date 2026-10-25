import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import CampaignChatHandler from '../handlers/CampaignChat.handler';

type ChatAction = 'setup' | 'listChannels' | 'createChannel' | 'updateChannel' | 'listMessages' | 'sendMessage' | 'updateMessage' | 'deleteMessage' | 'markRead';

export default class CampaignChatService {
  private readonly handler = new CampaignChatHandler();

  private endpoint(action: ChatAction) {
    return asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const result = await this.handler[action](req);
      return res.status(result.status).json(result.body);
    });
  }

  setup = this.endpoint('setup');
  listChannels = this.endpoint('listChannels');
  createChannel = this.endpoint('createChannel');
  updateChannel = this.endpoint('updateChannel');
  listMessages = this.endpoint('listMessages');
  sendMessage = this.endpoint('sendMessage');
  updateMessage = this.endpoint('updateMessage');
  deleteMessage = this.endpoint('deleteMessage');
  markRead = this.endpoint('markRead');
}

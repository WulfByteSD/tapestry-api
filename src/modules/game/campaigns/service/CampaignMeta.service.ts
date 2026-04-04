import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { CRUDService } from '../../../../utils/baseCRUD';
import { CampaignHandler } from '../handlers/Campaign.handler';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CampaignMetaHandler } from '../handlers/CampaignMeta.handler';

export default class CampaignMetaService {
  private metaHandler: CampaignMetaHandler;
  constructor() {
    this.metaHandler = new CampaignMetaHandler();
  }

  roleChange = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
      if (!playerProfile) {
        return res.status(403).json({ error: 'Player profile not found' });
      }
      await this.metaHandler.handleRoleChange(req.params.id as any, req.params.playerId as any, req.body.role, playerProfile._id.toString());
      return res.status(200).json({ message: 'Role updated successfully' });
    } catch (err) {
      console.error('Error changing campaign member role:', err);
      return error(err, req, res);
    }
  });
}

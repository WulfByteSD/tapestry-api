import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { CRUDService } from '../../../../utils/baseCRUD';
import { CampaignHandler } from '../handlers/Campaign.handler';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';

type CampaignInput = {
  owner: string;
  setting?: string;
  name: string;
  description?: string;
  members?: any[];
  // TODO: Add campaign fields once schema is finalized
};

export default class CampaignService extends CRUDService {
  private campaignHandler: CampaignHandler;

  constructor() {
    super(CampaignHandler);
    this.campaignHandler = this.handler as CampaignHandler;
    this.queryKeys = ['name', 'setting', 'status'];
    this.requiresAuth = {
      create: true,
      getResources: true,
      getResource: true,
      updateResource: true,
      removeResource: true,
    };
  }

  /**
   * Hook: before creating a campaign, set the owner reference
   */
  protected async beforeCreate(data: any): Promise<void> {
    // Find the player profile for the authenticated user
    const playerProfile = await PlayerModel.findOne({ user: data.user });
    if (!playerProfile) {
      throw new Error('Player profile not found for user');
    }

    // Verify user has storyweaver role
    if (!playerProfile.roles.includes('storyweaver')) {
      throw new Error('Must have storyweaver role to create campaigns');
    }

    // Set the owner reference
    data.owner = playerProfile._id;
  }

  /**
   * Hook: before fetching all, filter by storyweaver/player participation
   */
  protected async beforeFetchAll(options: any): Promise<void> {
    // TODO: Implement role-based filtering once authentication is wired up
    // Users should see campaigns they run or participate in
  }

  /**
   * Add a member to a campaign
   */
  addMember = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { playerId, role = 'player' } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    // Find player profile for ownership verification
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    // Verify ownership or co-sw role
    const campaign = await CampaignModel.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const userMember = campaign.members.find((m) => m.player.toString() === playerProfile._id.toString());
    const canManage = campaign.owner.toString() === playerProfile._id.toString() || (userMember && ['sw', 'co-sw'].includes(userMember.role));

    if (!canManage) {
      return res.status(403).json({ error: 'Only campaign owners and co-storyweavers can add members' });
    }

    const updatedCampaign = await this.campaignHandler.addMember(campaignId as string, playerId, role);

    res.status(200).json(updatedCampaign);
  });

  /**
   * Remove a member from a campaign
   */
  removeMember = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId, playerId } = req.params;

    if (!playerId) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    // Find player profile for ownership verification
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    // Verify ownership or co-sw role
    const campaign = await CampaignModel.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const userMember = campaign.members.find((m) => m.player.toString() === playerProfile._id.toString());
    const canManage = campaign.owner.toString() === playerProfile._id.toString() || (userMember && ['sw', 'co-sw'].includes(userMember.role));

    if (!canManage) {
      return res.status(403).json({ error: 'Only campaign owners and co-storyweavers can remove members' });
    }

    const updatedCampaign = await this.campaignHandler.removeMember(campaignId as string, playerId);

    res.status(200).json(updatedCampaign);
  });
}

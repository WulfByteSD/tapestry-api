import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { CRUDService } from '../../../../utils/baseCRUD';
import { JoinRequestHandler } from '../handlers/JoinRequest.handler';
import JoinRequestModel from '../model/JoinRequestModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import asyncHandler from '../../../../middleware/asyncHandler';
import { CampaignRole } from '../model/CampaignModel';

export default class JoinRequestService extends CRUDService {
  private joinRequestHandler: JoinRequestHandler;

  constructor() {
    super(JoinRequestHandler);
    this.joinRequestHandler = this.handler as JoinRequestHandler;
    this.queryKeys = ['status', 'campaign', 'player'];
    this.requiresAuth = {
      create: true,
      getResources: true,
      getResource: true,
      updateResource: true,
      removeResource: true,
    };
  }

  /**
   * Create a join request for a campaign
   * POST /campaigns/:id/join-requests
   */
  createJoinRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { message, preferredRole = 'player' } = req.body;

    // Find player profile for the authenticated user
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    const joinRequest = await this.joinRequestHandler.createRequest(campaignId as string, playerProfile._id.toString(), message, preferredRole as CampaignRole);

    res.status(201).json(joinRequest);
  });

  /**
   * List pending join requests for a campaign (owner/co-sw only)
   * GET /campaigns/:id/join-requests
   */
  listPendingRequests = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;

    // Find player profile for the authenticated user
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    // Verify user has permission to view requests (owner or co-sw)
    const CampaignModel = (await import('../model/CampaignModel')).default;
    const campaign = await CampaignModel.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const userMember = campaign.members.find((m) => m.player.toString() === playerProfile._id.toString());
    const canManage = campaign.owner.toString() === playerProfile._id.toString() || (userMember && ['sw', 'co-sw'].includes(userMember.role));

    if (!canManage) {
      return res.status(403).json({ error: 'Only campaign owners and co-storyweavers can view join requests' });
    }

    const requests = await this.joinRequestHandler.listPendingRequests(campaignId as string);

    res.status(200).json(requests);
  });

  /**
   * Get the authenticated player's own join requests across all campaigns
   * GET /campaigns/join-requests/me
   */
  getMyRequests = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Find player profile for the authenticated user
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    const requests = await this.joinRequestHandler.getPlayerRequests(playerProfile._id.toString());

    res.status(200).json(requests);
  });

  /**
   * Approve a join request
   * POST /campaigns/:id/join-requests/:requestId/approve
   */
  approveRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId, requestId } = req.params;
    const { role } = req.body; // Optional: storyweaver can override the preferred role

    // Find player profile for the authenticated user (storyweaver)
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    const updatedRequest = await this.joinRequestHandler.approveRequest(requestId as string, playerProfile._id.toString(), role as CampaignRole | undefined);

    res.status(200).json(updatedRequest);
  });

  /**
   * Deny a join request
   * POST /campaigns/:id/join-requests/:requestId/deny
   */
  denyRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId, requestId } = req.params;

    // Find player profile for the authenticated user (storyweaver)
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    const updatedRequest = await this.joinRequestHandler.denyRequest(requestId as string, playerProfile._id.toString());

    res.status(200).json(updatedRequest);
  });

  /**
   * Direct join an open campaign
   * POST /campaigns/:id/join
   */
  joinCampaign = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { role = 'player' } = req.body;

    // Find player profile for the authenticated user
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    const result = await this.joinRequestHandler.directJoin(campaignId as string, playerProfile._id.toString(), role as CampaignRole);

    res.status(200).json(result);
  });
}

import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDHandler, PaginationOptions } from '../../../../utils/baseCRUD';
import JoinRequestModel, { JoinRequestType, JoinRequestStatus } from '../model/JoinRequestModel';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { CampaignHandler } from './Campaign.handler';
import { eventBus } from '../../../../lib/eventBus';
import { CampaignRole } from '../model/CampaignModel';

export class JoinRequestHandler extends CRUDHandler<JoinRequestType> {
  private campaignHandler: CampaignHandler;

  constructor() {
    super(JoinRequestModel);
    this.campaignHandler = new CampaignHandler();
  }

  /**
   * Create a join request for a campaign
   */
  async createRequest(campaignId: string, playerId: string, message?: string, preferredRole: CampaignRole = 'player'): Promise<JoinRequestType> {
    try {
      // Validate campaign exists
      const campaign = await CampaignModel.findById(campaignId);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      // Check joinPolicy
      if (campaign.joinPolicy === 'invite-only') {
        throw new ErrorUtil('This campaign is invite-only. You need an invite code to join.', 403);
      }

      if (campaign.joinPolicy === 'open') {
        throw new ErrorUtil('This campaign allows direct joining. No request needed.', 400);
      }

      // Validate player exists
      const player = await PlayerModel.findById(playerId);
      if (!player) {
        throw new ErrorUtil('Player profile not found', 404);
      }

      // Check if player is already a member
      const existingMember = campaign.members.find((member) => member.player.toString() === playerId);
      if (existingMember) {
        throw new ErrorUtil('You are already a member of this campaign', 400);
      }

      // Check if there's already a pending request (unique index will also catch this)
      const existingRequest = await this.Schema.findOne({
        campaign: campaignId as any,
        player: playerId as any,
        status: 'pending',
      });
      if (existingRequest) {
        throw new ErrorUtil('You already have a pending request for this campaign', 400);
      }

      // Check maxPlayers limit if set
      if (campaign.maxPlayers > 0 && campaign.members.length >= campaign.maxPlayers) {
        throw new ErrorUtil('This campaign has reached its maximum player limit', 400);
      }

      // Create the join request
      const joinRequest = await this.Schema.create({
        campaign: campaignId as any,
        player: playerId as any,
        status: 'pending',
        message: message || undefined,
        preferredRole,
        requestedAt: new Date(),
      });

      // Emit event for notification system
      eventBus.publish('game.campaign.join_requested', {
        campaignId,
        playerId,
        requestId: joinRequest._id.toString(),
        message,
        preferredRole,
      });

      return joinRequest;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      if ((error as any).code === 11000) {
        // Duplicate key error from unique index
        throw new ErrorUtil('You already have a pending request for this campaign', 400);
      }
      throw new ErrorUtil('Failed to create join request', 500);
    }
  }

  /**
   * Approve a join request
   */
  async approveRequest(requestId: string, storyweaverId: string, assignedRole?: CampaignRole): Promise<JoinRequestType> {
    try {
      const request = await this.Schema.findById(requestId);
      if (!request) {
        throw new ErrorUtil('Join request not found', 404);
      }

      if (request.status !== 'pending') {
        throw new ErrorUtil('This request has already been processed', 400);
      }

      // Validate campaign and permissions
      const campaign = await CampaignModel.findById(request.campaign);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      // Check if storyweaver has permission (owner or co-sw)
      const storyweaverMember = campaign.members.find((m) => m.player.toString() === storyweaverId);
      const canManage = campaign.owner.toString() === storyweaverId || (storyweaverMember && ['sw', 'co-sw'].includes(storyweaverMember.role));

      if (!canManage) {
        throw new ErrorUtil('Only campaign owners and co-storyweavers can approve join requests', 403);
      }

      // Check maxPlayers limit again (in case it changed)
      if (campaign.maxPlayers > 0 && campaign.members.length >= campaign.maxPlayers) {
        throw new ErrorUtil('Campaign has reached maximum player limit', 400);
      }

      // Determine the role to assign (use provided role or fall back to preferred role)
      const roleToAssign = assignedRole || request.preferredRole;

      // Ensure role is valid for addMember (exclude 'sw' role)
      const validRole = roleToAssign === 'sw' ? 'player' : roleToAssign;

      // Add player to campaign members
      await this.campaignHandler.addMember(request.campaign.toString(), request.player.toString(), validRole as 'player' | 'co-sw' | 'observer');

      // Update request status
      request.status = 'approved';
      request.respondedAt = new Date();
      request.respondedBy = storyweaverId as any;
      await request.save();

      // Emit event for notification system
      eventBus.publish('game.campaign.join_approved', {
        campaignId: request.campaign.toString(),
        playerId: request.player.toString(),
        requestId: request._id.toString(),
        role: roleToAssign,
      });

      return request;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to approve join request', 500);
    }
  }

  /**
   * Deny a join request
   */
  async denyRequest(requestId: string, storyweaverId: string): Promise<JoinRequestType> {
    try {
      const request = await this.Schema.findById(requestId);
      if (!request) {
        throw new ErrorUtil('Join request not found', 404);
      }

      if (request.status !== 'pending') {
        throw new ErrorUtil('This request has already been processed', 400);
      }

      // Validate campaign and permissions
      const campaign = await CampaignModel.findById(request.campaign);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      // Check if storyweaver has permission (owner or co-sw)
      const storyweaverMember = campaign.members.find((m) => m.player.toString() === storyweaverId);
      const canManage = campaign.owner.toString() === storyweaverId || (storyweaverMember && ['sw', 'co-sw'].includes(storyweaverMember.role));

      if (!canManage) {
        throw new ErrorUtil('Only campaign owners and co-storyweavers can deny join requests', 403);
      }

      // Update request status
      request.status = 'denied';
      request.respondedAt = new Date();
      request.respondedBy = storyweaverId as any;
      await request.save();

      // Emit event for notification system
      eventBus.publish('game.campaign.join_denied', {
        campaignId: request.campaign.toString(),
        playerId: request.player.toString(),
        requestId: request._id.toString(),
      });

      return request;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to deny join request', 500);
    }
  }

  /**
   * List pending join requests for a campaign
   */
  async listPendingRequests(campaignId: string): Promise<JoinRequestType[]> {
    try {
      const requests = await this.Schema.find({
        campaign: campaignId as any,
        status: 'pending',
      })
        .populate('player', 'displayName avatar user')
        .sort({ requestedAt: -1 });

      return requests;
    } catch (error) {
      throw new ErrorUtil('Failed to fetch pending join requests', 500);
    }
  }

  /**
   * Get all join requests submitted by a specific player
   */
  async getPlayerRequests(playerId: string): Promise<JoinRequestType[]> {
    try {
      const requests = await this.Schema.find({
        player: playerId as any,
      })
        .populate('campaign', 'name avatar status joinPolicy')
        .sort({ requestedAt: -1 });

      return requests;
    } catch (error) {
      throw new ErrorUtil('Failed to fetch player join requests', 500);
    }
  }

  /**
   * Direct join for open campaigns
   * Allows a player to immediately join without approval
   */
  async directJoin(campaignId: string, playerId: string, role: CampaignRole = 'player'): Promise<{ campaign: any; message: string }> {
    try {
      // Validate campaign exists
      const campaign = await CampaignModel.findById(campaignId);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      // Check joinPolicy - must be 'open'
      if (campaign.joinPolicy !== 'open') {
        throw new ErrorUtil('This campaign does not allow direct joining. Please request to join instead.', 403);
      }

      // Validate player exists
      const player = await PlayerModel.findById(playerId);
      if (!player) {
        throw new ErrorUtil('Player profile not found', 404);
      }

      // Check if player is already a member
      const existingMember = campaign.members.find((member) => member.player.toString() === playerId);
      if (existingMember) {
        throw new ErrorUtil('You are already a member of this campaign', 400);
      }

      // Validate role - only 'player' or 'observer' allowed for direct join
      if (role !== 'player' && role !== 'observer') {
        throw new ErrorUtil('Only player or observer roles are allowed for direct joining', 400);
      }

      // Check maxPlayers limit if set, if player is joining as a player (observers don't count towards maxPlayers)
      if (role === 'player' && campaign.maxPlayers > 0 && campaign.members.filter((m) => m.role === 'player').length >= campaign.maxPlayers) {
        throw new ErrorUtil('This campaign has reached its maximum player limit', 400);
      }

      // Add player to campaign members directly
      const updatedCampaign = await this.campaignHandler.addMember(campaignId, playerId, role as 'player' | 'observer');

      return {
        campaign: updatedCampaign,
        message: `Successfully joined "${campaign.name}" as ${role}`,
      };
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to join campaign', 500);
    }
  }
}

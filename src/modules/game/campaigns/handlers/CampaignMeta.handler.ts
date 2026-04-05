import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDHandler, PaginationOptions } from '../../../../utils/baseCRUD';
import JoinRequestModel, { JoinRequestType, JoinRequestStatus } from '../model/JoinRequestModel';
import CampaignModel, { CampaignType } from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { CampaignHandler } from './Campaign.handler';
import { eventBus } from '../../../../lib/eventBus';
import { CampaignRole } from '../model/CampaignModel';

export class CampaignMetaHandler {
  constructor() {}

  /**
   * Handle role change for a campaign member
   * If the role is changed to 'player' or 'observer', ensure maxPlayers limit is not exceeded
   * If the role is changed to 'sw' or 'co-sw', ensure the user has the storyweaver role in their profile, or is the owner of the campaign
   * Emit event for campaign member role change
   * @param campaignId - Campaign ID to update
   * @param playerId - Player ID whose role is being changed
   * @param newRole - New role to assign (sw, co-sw, player, observer)
   * @param changedById - Player ID of the user making the change (for permission checks and event metadata)
   * @returns Updated campaign document
   */
  async handleRoleChange(campaignId: string, playerId: string, newRole: CampaignRole, changedById: string): Promise<CampaignType> {
    try {
      const campaign = await CampaignModel.findById(campaignId);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }
      const member = campaign.members.find((m) => m.player.toString() === playerId);
      if (!member) {
        throw new ErrorUtil('Player is not a member of this campaign', 404);
      }
      // check if the user making the change is the owner or a co-sw
      const requestingMember = campaign.members.find((m) => m.player.toString() === changedById);
      if (
        !requestingMember ||
        (requestingMember.role !== 'sw' && requestingMember.role !== 'co-sw') ||
        (requestingMember.player.toString() !== campaign.owner.toString() && requestingMember.role !== 'sw')
      ) {
        throw new ErrorUtil('Only the storyweaver or co-storyweavers can change member roles', 403);
      }
      // if the member is becoming a storyweaver or co-storyweaver, check they have the storyweaver role in their profile or are the owner
      if (['sw', 'co-sw'].includes(newRole)) {
        const playerProfile = await PlayerModel.findById(playerId);
        if (!playerProfile) {
          throw new ErrorUtil('Player profile not found', 404);
        }
        const isOwner = campaign.owner.toString() === playerId;
        if (!isOwner && !playerProfile.roles.includes('storyweaver')) {
          throw new ErrorUtil('Player must have storyweaver role to be assigned as a storyweaver or co-storyweaver in a campaign', 400);
        }
      } else if (!['player', 'observer'].includes(newRole)) {
        throw new ErrorUtil('Invalid role', 400);
      }

      // Update the member's role (Mongoose subdocument - mutate directly)
      const oldRole = member.role;
      member.role = newRole;
      await campaign.save();

      // Emit event for role change
      eventBus.publish('game.campaign.member_role_changed', {
        campaignId: campaign._id.toString(),
        playerId,
        oldRole,
        newRole,
        changedBy: changedById,
      });

      return campaign;
    } catch (error: any) {
      console.error('Error handling campaign member role change:', error);
      throw new ErrorUtil(error, error.statusCode || 500);
    }
  }
}

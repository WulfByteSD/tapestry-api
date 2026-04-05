import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDHandler } from '../../../../utils/baseCRUD';
import CharacterRequestModel, { CharacterRequestType } from '../model/CharacterRequestModel';
import CampaignModel from '../model/CampaignModel';
import CharacterModel from '../../characters/model/CharacterModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { eventBus } from '../../../../lib/eventBus';

export class CharacterRequestHandler extends CRUDHandler<CharacterRequestType> {
  constructor() {
    super(CharacterRequestModel);
  }

  /**
   * Submit a request to attach a character to a campaign.
   * Player must be an existing campaign member and own the character.
   */
  async createRequest(campaignId: string, playerId: string, characterId: string, message?: string): Promise<CharacterRequestType> {
    try {
      const campaign = await CampaignModel.findById(campaignId);
      if (!campaign) throw new ErrorUtil('Campaign not found', 404);

      // Player must already be a campaign member
      const member = campaign.members.find((m) => m.player.toString() === playerId);
      if (!member) throw new ErrorUtil('You must be a campaign member to attach a character', 403);

      const character = await CharacterModel.findById(characterId);
      if (!character) throw new ErrorUtil('Character not found', 404);
      if (character.player.toString() !== playerId) throw new ErrorUtil('This character does not belong to you', 403);
      if (character.campaign) throw new ErrorUtil('This character is already attached to a campaign', 400);

      // Guard against duplicate pending requests (unique index covers this too)
      const existing = await this.Schema.findOne({
        campaign: campaignId as any,
        character: characterId as any,
        status: 'pending',
      });
      if (existing) throw new ErrorUtil('A pending request already exists for this character in this campaign', 400);

      const request = await this.Schema.create({
        campaign: campaignId as any,
        character: characterId as any,
        player: playerId as any,
        status: 'pending',
        message: message || undefined,
        requestedAt: new Date(),
      });

      eventBus.publish('game.campaign.character_requested', {
        campaignId,
        playerId,
        characterId,
        requestId: request._id.toString(),
        message,
      });

      return request;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      if ((error as any).code === 11000) throw new ErrorUtil('A pending request already exists for this character in this campaign', 400);
      throw new ErrorUtil('Failed to create character request', 500);
    }
  }

  /**
   * Approve a character request. Dual-write: sets Character.campaign and pushes into members[x].characters.
   */
  async approveRequest(requestId: string, storyweaverId: string): Promise<CharacterRequestType> {
    try {
      const request = await this.Schema.findById(requestId);
      if (!request) throw new ErrorUtil('Character request not found', 404);
      if (request.status !== 'pending') throw new ErrorUtil('This request has already been processed', 400);

      const campaign = await CampaignModel.findById(request.campaign);
      if (!campaign) throw new ErrorUtil('Campaign not found', 404);

      const swMember = campaign.members.find((m) => m.player.toString() === storyweaverId);
      const canManage = campaign.owner.toString() === storyweaverId || (swMember && ['sw', 'co-sw'].includes(swMember.role));
      if (!canManage) throw new ErrorUtil('Only campaign owners and co-storyweavers can approve character requests', 403);

      const charId = request.character.toString();
      const campId = request.campaign.toString();

      // 1. Set Character.campaign
      await CharacterModel.findByIdAndUpdate(charId, { campaign: campId });

      // 2. Push into members[x].characters
      const member = campaign.members.find((m) => m.player.toString() === request.player.toString());
      if (member) {
        (member.characters as any[]).push(request.character);
      }
      await campaign.save();

      request.status = 'approved';
      request.resolvedAt = new Date();
      request.resolvedBy = storyweaverId as any;
      await request.save();

      eventBus.publish('game.campaign.character_approved', {
        campaignId: campId,
        playerId: request.player.toString(),
        characterId: charId,
        requestId: request._id.toString(),
      });

      return request;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to approve character request', 500);
    }
  }

  /**
   * Reject a character request.
   */
  async rejectRequest(requestId: string, storyweaverId: string): Promise<CharacterRequestType> {
    try {
      const request = await this.Schema.findById(requestId);
      if (!request) throw new ErrorUtil('Character request not found', 404);
      if (request.status !== 'pending') throw new ErrorUtil('This request has already been processed', 400);

      const campaign = await CampaignModel.findById(request.campaign);
      if (!campaign) throw new ErrorUtil('Campaign not found', 404);

      const swMember = campaign.members.find((m) => m.player.toString() === storyweaverId);
      const canManage = campaign.owner.toString() === storyweaverId || (swMember && ['sw', 'co-sw'].includes(swMember.role));
      if (!canManage) throw new ErrorUtil('Only campaign owners and co-storyweavers can reject character requests', 403);

      request.status = 'rejected';
      request.resolvedAt = new Date();
      request.resolvedBy = storyweaverId as any;
      await request.save();

      eventBus.publish('game.campaign.character_rejected', {
        campaignId: request.campaign.toString(),
        playerId: request.player.toString(),
        characterId: request.character.toString(),
        requestId: request._id.toString(),
      });

      return request;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to reject character request', 500);
    }
  }

  /**
   * List character requests for a campaign, optionally filtered by status.
   */
  async listRequests(campaignId: string, status?: string): Promise<CharacterRequestType[]> {
    try {
      const filter: Record<string, any> = { campaign: campaignId as any };
      if (status) filter.status = status;

      return await this.Schema.find(filter)
        .populate('character', 'name avatarUrl status sheet.archetypeKey')
        .populate('player', 'displayName avatar user')
        .sort({ requestedAt: -1 });
    } catch (error) {
      throw new ErrorUtil('Failed to fetch character requests', 500);
    }
  }

  /**
   * Get all character requests submitted by a specific player for a specific campaign.
   */
  async getPlayerRequests(campaignId: string, playerId: string): Promise<CharacterRequestType[]> {
    try {
      return await this.Schema.find({ player: playerId as any, campaign: campaignId as any })
        .populate('campaign', 'name avatar status')
        .populate('character', 'name avatarUrl status')
        .sort({ requestedAt: -1 });
    } catch (error) {
      throw new ErrorUtil('Failed to fetch player character requests', 500);
    }
  }

  /**
   * Directly attach a character to a campaign without a request (SW/co-SW only — for DMPCs).
   * Performs the same dual-write as approval.
   */
  async directAttach(campaignId: string, storyweaverId: string, characterId: string): Promise<{ campaign: any; character: any }> {
    try {
      const campaign = await CampaignModel.findById(campaignId);
      if (!campaign) throw new ErrorUtil('Campaign not found', 404);

      const swMember = campaign.members.find((m) => m.player.toString() === storyweaverId);
      const canManage = campaign.owner.toString() === storyweaverId || (swMember && ['sw', 'co-sw'].includes(swMember.role));
      if (!canManage) throw new ErrorUtil('Only campaign owners and co-storyweavers can directly attach characters', 403);

      const character = await CharacterModel.findById(characterId);
      if (!character) throw new ErrorUtil('Character not found', 404);
      if (character.campaign) throw new ErrorUtil('This character is already attached to a campaign', 400);

      // Dual-write
      character.campaign = campaignId as any;
      await character.save();

      const member = campaign.members.find((m) => m.player.toString() === character.player.toString());
      if (member) {
        (member.characters as any[]).push(character._id);
      }
      await campaign.save();

      eventBus.publish('game.campaign.character_approved', {
        campaignId,
        playerId: character.player.toString(),
        characterId,
      });

      return { campaign, character };
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to attach character to campaign', 500);
    }
  }

  /**
   * Detach a character from a campaign (dual-clear).
   * Allowed by SW/co-SW or the character's owning player.
   */
  async detachCharacter(campaignId: string, charId: string, requesterId: string): Promise<void> {
    try {
      const [campaign, character] = await Promise.all([CampaignModel.findById(campaignId), CharacterModel.findById(charId)]);

      if (!campaign) throw new ErrorUtil('Campaign not found', 404);
      if (!character) throw new ErrorUtil('Character not found', 404);

      if (!character.campaign || character.campaign.toString() !== campaignId) {
        throw new ErrorUtil('Character is not attached to this campaign', 400);
      }

      const requesterMember = campaign.members.find((m) => m.player.toString() === requesterId);
      const isSwOrCoSw = campaign.owner.toString() === requesterId || (requesterMember && ['sw', 'co-sw'].includes(requesterMember.role));
      const isCharacterOwner = character.player.toString() === requesterId;

      if (!isSwOrCoSw && !isCharacterOwner) {
        throw new ErrorUtil('You do not have permission to detach this character', 403);
      }

      // Dual-clear
      character.campaign = null as any;
      await character.save();

      for (const member of campaign.members) {
        const chars = member.characters as mongoose.Types.ObjectId[];
        const idx = chars.findIndex((c) => c.toString() === charId);
        if (idx !== -1) {
          chars.splice(idx, 1);
          break;
        }
      }
      await campaign.save();

      eventBus.publish('game.campaign.character_detached', {
        campaignId,
        playerId: character.player.toString(),
        characterId: charId,
      });
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to detach character from campaign', 500);
    }
  }
}

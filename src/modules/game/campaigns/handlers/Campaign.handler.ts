import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDHandler, PaginationOptions } from '../../../../utils/baseCRUD';
import CampaignModel, { CampaignType } from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import CharacterModel from '../../characters/model/CharacterModel';
import { eventBus } from '../../../../lib/eventBus';

export class CampaignHandler extends CRUDHandler<CampaignType> {
  constructor() {
    super(CampaignModel);
  }

  protected async beforeCreate(data: any): Promise<void> {
    // Validate that owner reference exists and has storyweaver role
    if (!data.owner) {
      throw new ErrorUtil('Campaign owner (storyweaver) is required', 400);
    }

    const owner = await PlayerModel.findById(data.owner);
    if (!owner) {
      throw new ErrorUtil('Storyweaver profile not found', 404);
    }

    if (!owner.roles.includes('storyweaver')) {
      throw new ErrorUtil('User must have storyweaver role to create campaigns', 403);
    }

    // Initialize members array with the owner as 'sw' (storyweaver)
    if (!data.members || data.members.length === 0) {
      data.members = [
        {
          player: data.owner,
          role: 'sw',
          joinedAt: new Date(),
        },
      ];
    }

    // TODO: Add validation for campaign data structure once schema is finalized
    // TODO: Validate setting if provided (check against SettingsRegistry)
  }

  protected async afterCreate(doc: CampaignType): Promise<void> {
    try {
      // Emit event for storyweaver stats update
      // get the storweaver id from the members list where the member role is 'sw'
      const storyweaverId = doc.members.find((member) => member.role === 'sw')?.player;
      // TODO: implement event handler to update storyweaver stats (e.g. campaign count) when this event is published
      eventBus.publish('game.campaign.created', {
        campaignId: doc._id,
        storyweaverId: storyweaverId,
      });
    } catch (error) {
      console.error('Failed to publish campaign creation event:', error);
      // Don't throw - campaign was created successfully
    }
  }

  protected async beforeUpdate(id: string, data: any): Promise<void> {
    // Prevent changing the campaign owner
    if (data.owner) {
      throw new ErrorUtil('Cannot change campaign owner', 400);
    }

    // TODO: Add validation for campaign data structure once schema is finalized
  }

  /**
   * Add a player to a campaign (invite/join)
   */
  async addMember(campaignId: string, playerId: string, role: 'player' | 'co-sw' | 'observer' = 'player'): Promise<CampaignType> {
    try {
      const campaign = await this.Schema.findById(campaignId);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      // Check if player is already a member
      const existingMember = campaign.members.find((member) => member.player.toString() === playerId);
      if (existingMember) {
        throw new ErrorUtil('Player is already a member of this campaign', 400);
      }

      // Add the member
      campaign.members.push({
        player: playerId as any,
        role,
        joinedAt: new Date(),
      });

      await campaign.save();

      // Emit event for tracking
      eventBus.publish('game.campaign.member_joined', {
        campaignId: campaign._id,
        playerId,
        role,
      });

      return campaign;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to add member to campaign', 500);
    }
  }

  /**
   * Remove a player from a campaign
   */
  async removeMember(campaignId: string, playerId: string): Promise<CampaignType> {
    try {
      const campaign = await this.Schema.findById(campaignId);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      // Cannot remove the owner
      if (campaign.owner.toString() === playerId) {
        throw new ErrorUtil('Cannot remove campaign owner', 400);
      }

      // Remove the member
      campaign.members = campaign.members.filter((member) => member.player.toString() !== playerId);

      await campaign.save();

      // Clear campaign reference from any of the player's characters
      const CharacterModel = (await import('../../characters/model/CharacterModel')).default;
      await CharacterModel.updateMany({ player: playerId as any, campaign: campaignId as any }, { campaign: null });

      // Emit event for tracking
      eventBus.publish('game.campaign.member_left', {
        campaignId: campaign._id,
        playerId,
      });

      return campaign;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to remove member from campaign', 500);
    }
  }

  async fetchAll(options: PaginationOptions): Promise<{ entries: CampaignType[]; metadata: any[] }[]> {
    try {
      return await this.Schema.aggregate([
        {
          $match: {
            $and: [...options.filters],
            ...(options.query.length > 0 && { $or: options.query }),
          },
        },
        {
          $sort: options.sort,
        },
        {
          $facet: {
            metadata: [{ $count: 'totalCount' }, { $addFields: { page: options.page, limit: options.limit } }],
            entries: [
              { $skip: (options.page - 1) * options.limit },
              { $limit: options.limit },
              {
                $lookup: {
                  from: 'players',
                  localField: 'owner',
                  foreignField: '_id',
                  as: 'ownerProfile',
                },
              },
              {
                $unwind: {
                  path: '$ownerProfile',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $lookup: {
                  from: 'players',
                  localField: 'members.player',
                  foreignField: '_id',
                  as: 'memberProfiles',
                },
              },
            ],
          },
        },
      ]);
    } catch (error) {
      throw new ErrorUtil('Failed to fetch campaigns', 500);
    }
  }

  async fetch(id: string): Promise<CampaignType | null> {
    try {
      const campaign = await this.Schema.findById(id).populate('owner', 'displayName avatar timezone').populate('members.player', 'displayName avatar timezone').lean();

      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      return campaign;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to fetch campaign', 500);
    }
  }
}

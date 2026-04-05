import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { EmailService } from '../email/EmailService';
import Notification from '../model/Notification';
import CampaignModel from '../../game/campaigns/model/CampaignModel';
import PlayerModel from '../../profiles/player/model/PlayerModel';
import mongoose from 'mongoose';

export default class CampaignEventHandler {
  /**
   * Handle join request created event
   * Notify campaign owner and co-storyweavers
   */
  onJoinRequested = async (event: { campaignId: string; playerId: string; requestId: string; message?: string; preferredRole: string }) => {
    console.info(`[Notification] Join request created for campaign: ${event.campaignId}`);

    try {
      // Load campaign and player
      const campaign = await CampaignModel.findById(event.campaignId);
      const requestingPlayer = await PlayerModel.findById(event.playerId);

      if (!campaign || !requestingPlayer) {
        console.error('Campaign or player not found for join request notification');
        return;
      }

      // Get all storyweavers (owner + co-sw members)
      const storyweaverIds: mongoose.Types.ObjectId[] = [];

      // Add owner
      const owner = await PlayerModel.findById(campaign.owner);
      if (owner) {
        storyweaverIds.push(owner.user as any);
      }

      // Add co-storyweavers
      const coStoryweavers = campaign.members.filter((m) => m.role === 'co-sw');
      for (const coSw of coStoryweavers) {
        const player = await PlayerModel.findById(coSw.player);
        if (player) {
          storyweaverIds.push(player.user as any);
        }
      }

      // Create in-app notifications and send emails to all storyweavers
      const notificationMessage = `${requestingPlayer.displayName || 'A player'} has requested to join "${campaign.name}"`;
      const notificationDescription = event.message
        ? `Message: "${event.message.substring(0, 100)}${event.message.length > 100 ? '...' : ''}"`
        : `Requested role: ${event.preferredRole}`;

      for (const storyweaverUserId of storyweaverIds) {
        // Create in-app notification
        await Notification.insertNotification(
          storyweaverUserId,
          requestingPlayer.user as any,
          notificationMessage,
          notificationDescription,
          'campaign.joinRequest',
          new mongoose.Types.ObjectId(event.requestId)
        );

        // Send email notification
        const storyweaver = await mongoose.model('User').findById(storyweaverUserId);
        if (storyweaver && (storyweaver as any).email) {
          try {
            // TODO: Replace with actual template ID once created in Sparkpost
            await EmailService.sendEmail({
              to: (storyweaver as any).email,
              subject: `New Join Request for ${campaign.name}`,
              templateId: 'CAMPAIGN_JOIN_REQUEST_TEMPLATE_ID', // Placeholder - needs Sparkpost template
              data: {
                campaignName: campaign.name,
                playerName: requestingPlayer.displayName || 'A player',
                playerMessage: event.message || '',
                preferredRole: event.preferredRole,
                campaignUrl: `${process.env.FRONTEND_URL}/campaigns/${campaign._id}`,
                approveUrl: `${process.env.FRONTEND_URL}/campaigns/${campaign._id}/join-requests/${event.requestId}`,
                currentYear: new Date().getFullYear(),
                subject: `New Join Request for ${campaign.name}`,
              },
            });
          } catch (emailError) {
            console.error('Failed to send join request email:', emailError);
            // Don't throw - notification was created
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle join request event:', error);
      // Don't throw - this is a notification handler
    }
  };

  /**
   * Handle join request approved event
   * Notify the player that their request was approved
   */
  onJoinApproved = async (event: { campaignId: string; playerId: string; requestId: string; role: string }) => {
    console.info(`[Notification] Join request approved for campaign: ${event.campaignId}, player: ${event.playerId}`);

    try {
      // Load campaign and player
      const campaign = await CampaignModel.findById(event.campaignId);
      const player = await PlayerModel.findById(event.playerId);

      if (!campaign || !player) {
        console.error('Campaign or player not found for join approval notification');
        return;
      }

      // Create in-app notification
      const notificationMessage = `Your request to join "${campaign.name}" has been approved!`;
      const notificationDescription = `You have been added as a ${event.role}. Welcome to the campaign!`;

      await Notification.insertNotification(
        player.user as any,
        null as any, // System notification
        notificationMessage,
        notificationDescription,
        'campaign.joinApproved',
        new mongoose.Types.ObjectId(event.campaignId)
      );

      // Send email notification
      const user = await mongoose.model('User').findById(player.user);
      if (user && (user as any).email) {
        try {
          // TODO: Replace with actual template ID once created in Sparkpost
          await EmailService.sendEmail({
            to: (user as any).email,
            subject: `Welcome to ${campaign.name}!`,
            templateId: 'CAMPAIGN_JOIN_APPROVED_TEMPLATE_ID', // Placeholder - needs Sparkpost template
            data: {
              campaignName: campaign.name,
              role: event.role,
              campaignUrl: `${process.env.FRONTEND_URL}/campaigns/${campaign._id}`,
              currentYear: new Date().getFullYear(),
              subject: `Welcome to ${campaign.name}!`,
            },
          });
        } catch (emailError) {
          console.error('Failed to send join approval email:', emailError);
          // Don't throw - notification was created
        }
      }
    } catch (error) {
      console.error('Failed to handle join approval event:', error);
      // Don't throw - this is a notification handler
    }
  };

  /**
   * Handle join request denied event
   * Notify the player that their request was denied
   */
  onJoinDenied = async (event: { campaignId: string; playerId: string; requestId: string }) => {
    console.info(`[Notification] Join request denied for campaign: ${event.campaignId}, player: ${event.playerId}`);

    try {
      // Load campaign and player
      const campaign = await CampaignModel.findById(event.campaignId);
      const player = await PlayerModel.findById(event.playerId);

      if (!campaign || !player) {
        console.error('Campaign or player not found for join denial notification');
        return;
      }

      // Create in-app notification
      const notificationMessage = `Your request to join "${campaign.name}" was not approved`;
      const notificationDescription = `The storyweaver has declined your request at this time.`;

      await Notification.insertNotification(
        player.user as any,
        null as any, // System notification
        notificationMessage,
        notificationDescription,
        'campaign.joinDenied',
        new mongoose.Types.ObjectId(event.campaignId)
      );

      // Send email notification
      const user = await mongoose.model('User').findById(player.user);
      if (user && (user as any).email) {
        try {
          // TODO: Replace with actual template ID once created in Sparkpost
          await EmailService.sendEmail({
            to: (user as any).email,
            subject: `Campaign Join Request Update`,
            templateId: 'CAMPAIGN_JOIN_DENIED_TEMPLATE_ID', // Placeholder - needs Sparkpost template
            data: {
              campaignName: campaign.name,
              currentYear: new Date().getFullYear(),
              subject: `Campaign Join Request Update`,
            },
          });
        } catch (emailError) {
          console.error('Failed to send join denial email:', emailError);
          // Don't throw - notification was created
        }
      }
    } catch (error) {
      console.error('Failed to handle join denial event:', error);
      // Don't throw - this is a notification handler
    }
  };

  /**
   * Handle character request created event
   * Notify campaign owner and co-storyweavers
   */
  onCharacterRequested = async (event: { campaignId: string; playerId: string; characterId: string; requestId: string; message?: string }) => {
    console.info(`[Notification] Character request created for campaign: ${event.campaignId}`);

    try {
      const campaign = await CampaignModel.findById(event.campaignId);
      const requestingPlayer = await PlayerModel.findById(event.playerId);
      const CharacterModel = (await import('../../game/characters/model/CharacterModel')).default;
      const character = await CharacterModel.findById(event.characterId);

      if (!campaign || !requestingPlayer) {
        console.error('Campaign or player not found for character request notification');
        return;
      }

      const storyweaverIds: mongoose.Types.ObjectId[] = [];
      const owner = await PlayerModel.findById(campaign.owner);
      if (owner) storyweaverIds.push(owner.user as any);

      const coStoryweavers = campaign.members.filter((m) => m.role === 'co-sw');
      for (const coSw of coStoryweavers) {
        const player = await PlayerModel.findById(coSw.player);
        if (player) storyweaverIds.push(player.user as any);
      }

      const characterName = character?.name || 'A character';
      const notificationMessage = `${requestingPlayer.displayName || 'A player'} wants to bring "${characterName}" into "${campaign.name}"`;
      const notificationDescription = event.message
        ? `Message: "${event.message.substring(0, 100)}${event.message.length > 100 ? '...' : ''}"`
        : `Review the request to approve or reject.`;

      for (const storyweaverUserId of storyweaverIds) {
        await Notification.insertNotification(
          storyweaverUserId,
          requestingPlayer.user as any,
          notificationMessage,
          notificationDescription,
          'campaign.characterRequest',
          new mongoose.Types.ObjectId(event.requestId)
        );

        const storyweaver = await mongoose.model('User').findById(storyweaverUserId);
        if (storyweaver && (storyweaver as any).email) {
          try {
            await EmailService.sendEmail({
              to: (storyweaver as any).email,
              subject: `Character Request for ${campaign.name}`,
              templateId: 'CAMPAIGN_CHARACTER_REQUEST_TEMPLATE_ID',
              data: {
                campaignName: campaign.name,
                playerName: requestingPlayer.displayName || 'A player',
                characterName,
                playerMessage: event.message || '',
                approveUrl: `${process.env.FRONTEND_URL}/campaigns/${campaign._id}/character-requests/${event.requestId}`,
                currentYear: new Date().getFullYear(),
                subject: `Character Request for ${campaign.name}`,
              },
            });
          } catch (emailError) {
            console.error('Failed to send character request email:', emailError);
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle character request event:', error);
    }
  };

  /**
   * Handle character request approved event
   * Notify the player that their character was approved
   */
  onCharacterApproved = async (event: { campaignId: string; playerId: string; characterId: string; requestId?: string }) => {
    console.info(`[Notification] Character approved for campaign: ${event.campaignId}, player: ${event.playerId}`);

    try {
      const campaign = await CampaignModel.findById(event.campaignId);
      const player = await PlayerModel.findById(event.playerId);
      const CharacterModel = (await import('../../game/characters/model/CharacterModel')).default;
      const character = await CharacterModel.findById(event.characterId);

      if (!campaign || !player) {
        console.error('Campaign or player not found for character approval notification');
        return;
      }

      const characterName = character?.name || 'Your character';
      const notificationMessage = `"${characterName}" has been approved for "${campaign.name}"!`;
      const notificationDescription = `Your character is now part of the campaign. The adventure begins!`;

      await Notification.insertNotification(
        player.user as any,
        null as any,
        notificationMessage,
        notificationDescription,
        'campaign.characterApproved',
        new mongoose.Types.ObjectId(event.campaignId)
      );

      const user = await mongoose.model('Auth').findById(player.user);
      if (user && (user as any).email) {
        try {
          await EmailService.sendEmail({
            to: (user as any).email,
            subject: `Character Approved for ${campaign.name}`,
            templateId: 'CAMPAIGN_CHARACTER_APPROVED_TEMPLATE_ID',
            data: {
              campaignName: campaign.name,
              characterName,
              campaignUrl: `${process.env.FRONTEND_URL}/campaigns/${campaign._id}`,
              currentYear: new Date().getFullYear(),
              subject: `Character Approved for ${campaign.name}`,
            },
          });
        } catch (emailError) {
          console.error('Failed to send character approval email:', emailError);
        }
      }
    } catch (error) {
      console.error('Failed to handle character approval event:', error);
    }
  };

  /**
   * Handle character request rejected event
   * Notify the player that their request was rejected
   */
  onCharacterRejected = async (event: { campaignId: string; playerId: string; characterId: string; requestId: string }) => {
    console.info(`[Notification] Character request rejected for campaign: ${event.campaignId}, player: ${event.playerId}`);

    try {
      const campaign = await CampaignModel.findById(event.campaignId);
      const player = await PlayerModel.findById(event.playerId);
      const CharacterModel = (await import('../../game/characters/model/CharacterModel')).default;
      const character = await CharacterModel.findById(event.characterId);

      if (!campaign || !player) {
        console.error('Campaign or player not found for character rejection notification');
        return;
      }

      const characterName = character?.name || 'Your character';
      const notificationMessage = `"${characterName}" was not approved for "${campaign.name}"`;
      const notificationDescription = `The storyweaver has declined this character request.`;

      await Notification.insertNotification(
        player.user as any,
        null as any,
        notificationMessage,
        notificationDescription,
        'campaign.characterRejected',
        new mongoose.Types.ObjectId(event.requestId)
      );

      const user = await mongoose.model('Auth').findById(player.user);
      if (user && (user as any).email) {
        try {
          await EmailService.sendEmail({
            to: (user as any).email,
            subject: `Character Request Update — ${campaign.name}`,
            templateId: 'CAMPAIGN_CHARACTER_REJECTED_TEMPLATE_ID',
            data: {
              campaignName: campaign.name,
              characterName,
              currentYear: new Date().getFullYear(),
              subject: `Character Request Update — ${campaign.name}`,
            },
          });
        } catch (emailError) {
          console.error('Failed to send character rejection email:', emailError);
        }
      }
    } catch (error) {
      console.error('Failed to handle character rejection event:', error);
    }
  };
}

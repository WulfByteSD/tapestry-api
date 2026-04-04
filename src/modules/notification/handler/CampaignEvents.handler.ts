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
}

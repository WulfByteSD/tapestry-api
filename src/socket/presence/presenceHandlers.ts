import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import CampaignModel from '../../modules/game/campaigns/model/CampaignModel';
import { presenceStore } from './PresenceStore';

const PRESENCE_ROOM_PREFIX = 'campaign:presence:';

function presenceRoomKey(campaignId: string): string {
  return `${PRESENCE_ROOM_PREFIX}${campaignId}`;
}

export function registerPresenceHandlers(io: Server, socket: Socket) {
  const { userId, playerId, displayName, avatar } = socket.data;

  // ── presence:join-room ──────────────────────────────────────────────────
  socket.on('presence:join-room', async (campaignId: unknown) => {
    try {
      if (typeof campaignId !== 'string' || !mongoose.Types.ObjectId.isValid(campaignId)) {
        socket.emit('error', { message: 'Invalid campaignId' });
        return;
      }

      // Membership guard — must be campaign owner or a member
      const campaign = await CampaignModel.findById(campaignId).lean();
      if (!campaign) {
        socket.emit('error', { message: 'Campaign not found' });
        return;
      }

      const isOwner = campaign.owner.toString() === playerId;
      const isMember = campaign.members.some((m: any) => m.player.toString() === playerId);

      if (!isOwner && !isMember) {
        socket.emit('error', { message: 'Not a campaign member' });
        return;
      }

      const room = presenceRoomKey(campaignId);
      socket.join(room);

      const presence = {
        socketId: socket.id,
        userId,
        playerId,
        displayName,
        avatar: avatar ?? null,
        connectedAt: new Date(),
      };

      const isFirst = await presenceStore.addUser(campaignId, presence);

      // Send current room state to the joining socket only
      const roomUsers = await presenceStore.getRoomUsers(campaignId);
      socket.emit('presence:room-state', { campaignId, users: roomUsers });

      // Broadcast new user to others only when this is their first connection
      if (isFirst) {
        socket.to(room).emit('presence:user-joined', { campaignId, user: presence });
      }

      console.info(`[Presence] ${displayName} joined campaign ${campaignId}`);
    } catch (err) {
      console.error('[Presence] join-room error:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // ── presence:leave-room ─────────────────────────────────────────────────
  socket.on('presence:leave-room', async (campaignId: unknown) => {
    try {
      if (typeof campaignId !== 'string' || !mongoose.Types.ObjectId.isValid(campaignId)) {
        socket.emit('error', { message: 'Invalid campaignId' });
        return;
      }

      const room = presenceRoomKey(campaignId);
      socket.leave(room);

      const { wasLastConnection } = await presenceStore.removeUser(campaignId, socket.id);

      if (wasLastConnection) {
        io.to(room).emit('presence:user-left', { campaignId, userId, playerId });
      }

      console.info(`[Presence] ${displayName} left campaign ${campaignId}`);
    } catch (err) {
      console.error('[Presence] leave-room error:', err);
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      const campaigns = await presenceStore.getCampaignsForSocket(socket.id);

      for (const campaignId of campaigns) {
        const room = presenceRoomKey(campaignId);
        const { wasLastConnection } = await presenceStore.removeUser(campaignId, socket.id);

        if (wasLastConnection) {
          io.to(room).emit('presence:user-left', { campaignId, userId, playerId });
        }
      }

      console.info(`[Presence] ${displayName} disconnected (cleared ${campaigns.length} room(s))`);
    } catch (err) {
      console.error('[Presence] disconnect error:', err);
    }
  });
}

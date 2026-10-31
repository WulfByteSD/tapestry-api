import socket from '../../../../utils/socket';
import mongoose from 'mongoose';
import ChatChannelModel from '../model/ChatChannelModel';
import { revokeSceneAccess } from '../../encounters/utils/revokeSceneAccess';

export const CHAT_USER_ROOM_PREFIX = 'chat:user:';
export const CHAT_RESERVED_ROOM_PREFIX = 'chat:';

export function isChatReservedRoom(roomId: unknown): boolean {
  // Socket.IO accepts string arrays as well; reject every non-string legacy room input.
  return typeof roomId !== 'string' || roomId.startsWith(CHAT_RESERVED_ROOM_PREFIX);
}

export function chatUserRoom(playerId: string): string {
  return `${CHAT_USER_ROOM_PREFIX}${playerId}`;
}

export function emitChatToPlayers(playerIds: string[], event: string, payload: unknown): void {
  try {
    const io = socket.getIO();
    for (const playerId of [...new Set(playerIds.map(String))]) {
      io.to(chatUserRoom(playerId)).emit(event, payload);
    }
  } catch {
    // Chat HTTP operations remain available before Socket.IO is initialized.
  }
}

export async function notifyCampaignChatMemberJoined(campaignId: string, playerId: string): Promise<void> {
  emitChatToPlayers([playerId], 'chat:access:changed', {
    campaignId,
    channelIds: [],
    reason: 'campaign_member_joined',
  });
}

export async function revokeCampaignChatMember(campaignId: string, playerId: string): Promise<void> {
  await revokeSceneAccess(campaignId,playerId);
  await ChatChannelModel.updateMany(
    { campaign: campaignId, visibility: 'private', participantPlayerIds: new mongoose.Types.ObjectId(playerId) },
    { $pull: { participantPlayerIds: new mongoose.Types.ObjectId(playerId) } }
  );
  emitChatToPlayers([playerId], 'chat:access:changed', {
    campaignId,
    channelIds: [],
    reason: 'campaign_member_removed',
  });
}

export async function notifyCampaignChatRoleChanged(campaignId: string, playerId: string): Promise<void> {
  await revokeSceneAccess(campaignId,playerId);
  emitChatToPlayers([playerId], 'chat:access:changed', {
    campaignId,
    channelIds: [],
    reason: 'member_role_changed',
  });
}

export async function notifyCampaignChatDeleted(campaign: any): Promise<void> {
  const players = [...new Set([String(campaign.owner), ...campaign.members.map((member: any) => String(member.player))])];
  emitChatToPlayers(players, 'chat:access:changed', {
    campaignId: String(campaign._id),
    channelIds: [],
    reason: 'campaign_deleted',
  });
}

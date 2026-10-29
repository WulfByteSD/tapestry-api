import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CampaignModel, { CampaignRole } from '../model/CampaignModel';
import CharacterModel from '../../characters/model/CharacterModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import ChatChannelModel, { ChatChannelDoc, ChatMode, ChatVisibility } from '../model/ChatChannelModel';
import ChatMessageModel, { ChatComposition, ChatMessageDoc, ChatSpeakerType } from '../model/ChatMessageModel';
import ChatReadMarkerModel from '../model/ChatReadMarkerModel';
import { emitChatToPlayers } from '../chat/chatEvents';

const MAX_MESSAGE_LENGTH = 8000;
const MAX_CHANNEL_NAME_LENGTH = 80;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type ChatContext = {
  campaign: any;
  player: any;
  role: CampaignRole | 'owner';
};

function id(value: any): string {
  return String(value?._id ?? value);
}

function validId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ErrorUtil(`Invalid ${label}`, 400);
  }
  return value;
}

function requireNonEmpty(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new ErrorUtil(`${label} is required and must be ${maxLength} characters or fewer`, 400);
  }
  return value.trim();
}

function messageContent(body: any, speaker: ChatSpeakerType): { content: string; composition?: ChatComposition } {
  if (body.composition === undefined) return { content: requireNonEmpty(body.content, 'Message content', MAX_MESSAGE_LENGTH) };
  const input = body.composition;
  if (speaker !== 'character' || !input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ErrorUtil('Action and dialogue must be text belonging to a character message.', 400);
  }
  let composition: ChatComposition;
  if ('parts' in input) {
    if (Object.keys(input).some((key) => key !== 'parts') || !Array.isArray(input.parts) || input.parts.length > 32 || input.parts.some((part: any) => !part || typeof part !== 'object' || Array.isArray(part) || Object.keys(part).some((key) => !['type', 'text'].includes(key)) || !['action', 'dialogue'].includes(part.type) || typeof part.text !== 'string' || part.text.length > MAX_MESSAGE_LENGTH)) throw new ErrorUtil('Use up to 32 action or dialogue sections, each containing text.', 400);
    composition = { parts: input.parts.filter((part: any) => part.text.trim()).map((part: any) => ({ type: part.type, text: part.text })) };
  } else {
    // Preserve already-saved two-field messages and older clients without
    // guessing at the structure of any freeform Markdown message.
    if (Object.keys(input).some((key) => !['action', 'dialogue'].includes(key)) || typeof input.action !== 'string' || typeof input.dialogue !== 'string' || input.action.length > MAX_MESSAGE_LENGTH || input.dialogue.length > MAX_MESSAGE_LENGTH) throw new ErrorUtil('Action and dialogue must be text.', 400);
    composition = { action: input.action, dialogue: input.dialogue };
  }
  const content = compositionParts(composition).filter((part) => part.text.trim()).map((part) => {
    if (part.type === 'action') return part.text.trim();
    const spoken = part.text.trim().replace(/[\\`*_{}\[\]()#+.!|<>-]/g, '\\$&');
    return spoken.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
  }).join('\n\n');
  return { content: requireNonEmpty(content, 'Combined action and dialogue', MAX_MESSAGE_LENGTH), composition };
}

function compositionParts(composition: ChatComposition) {
  return composition.parts ?? [{ type: 'action' as const, text: composition.action }, { type: 'dialogue' as const, text: composition.dialogue }];
}

function sameComposition(left: any, right: any): boolean {
  if (left?.parts || right?.parts) return JSON.stringify(left?.parts) === JSON.stringify(right?.parts);
  return left?.action === right?.action && left?.dialogue === right?.dialogue;
}

function roleFor(campaign: any, playerId: string): CampaignRole | 'owner' | null {
  const member = campaign.members.find((entry: any) => id(entry.player) === playerId);
  if (member) return member.role;
  return id(campaign.owner) === playerId ? 'owner' : null;
}

function isStoryweaver(role: CampaignRole | 'owner' | null): boolean {
  return role === 'owner' || role === 'sw' || role === 'co-sw';
}

function memberPlayerIds(campaign: any): string[] {
  return [...new Set([id(campaign.owner), ...campaign.members.map((entry: any) => id(entry.player))])];
}

function canReadChannel(channel: any, playerId: string, role: CampaignRole | 'owner'): boolean {
  if (channel.visibility === 'campaign') return true;
  return isStoryweaver(role) || channel.participantPlayerIds.some((entry: any) => id(entry) === playerId);
}

function channelRecipients(channel: any, campaign: any): string[] {
  if (channel.visibility === 'campaign') return memberPlayerIds(campaign);
  const allowed = new Set(channel.participantPlayerIds.map((entry: any) => id(entry)));
  return memberPlayerIds(campaign).filter((playerId) => {
    if (allowed.has(playerId)) return true;
    return isStoryweaver(roleFor(campaign, playerId));
  });
}

function defaultChannelName(key: ChatMode): string {
  return key === 'ic' ? 'In Character' : 'Out of Character';
}

export type ChatHttpResult = { status: number; body: Record<string, any> };

export default class CampaignChatHandler {
  private async context(req: AuthenticatedRequest): Promise<ChatContext> {
    const campaignId = validId(req.params.campaignId, 'campaign ID');
    const player = await PlayerModel.findOne({ user: req.user._id } as any).lean();
    if (!player) throw new ErrorUtil('Player profile not found', 403);
    const campaign = await CampaignModel.findById(campaignId).lean();
    if (!campaign) throw new ErrorUtil('Campaign not found', 404);
    const playerId = id(player._id);
    const role = roleFor(campaign, playerId);
    if (!role) throw new ErrorUtil('Not a campaign member', 403);
    return { campaign, player, role };
  }

  private async requireWritableCampaign(context: ChatContext): Promise<void> {
    if (context.campaign.status === 'archived') throw new ErrorUtil('Archived campaigns are read-only', 403);
    if (context.campaign.playSurface === 'discord') throw new ErrorUtil('This table plays in Discord. Tapestry chat is read-only until a Storyweaver switches the play surface back.', 403);
  }

  private async channelFor(context: ChatContext, channelIdInput: unknown): Promise<ChatChannelDoc> {
    const channelId = validId(channelIdInput, 'channel ID');
    const channel = await ChatChannelModel.findOne({ _id: channelId, campaign: context.campaign._id });
    if (!channel) throw new ErrorUtil('Chat channel not found', 404);
    if (!canReadChannel(channel, id(context.player._id), context.role)) {
      throw new ErrorUtil('Not a member of this chat channel', 403);
    }
    return channel;
  }

  private async unreadCount(channelId: string, playerId: string): Promise<number> {
    const marker = await ChatReadMarkerModel.findOne({ channel: channelId, player: playerId }).lean();
    const filter: Record<string, any> = {
      channel: channelId,
      'author.player': { $ne: playerId },
      deletedAt: null,
    };
    if (marker?.lastReadMessage) filter._id = { $gt: marker.lastReadMessage };
    return ChatMessageModel.countDocuments(filter);
  }

  private async channelDto(channel: any, context: ChatContext): Promise<Record<string, any>> {
    const playerId = id(context.player._id);
    const marker = await ChatReadMarkerModel.findOne({ channel: channel._id, player: playerId }).lean();
    return {
      id: id(channel._id),
      campaignId: id(context.campaign._id),
      name: channel.name,
      mode: channel.mode,
      visibility: channel.visibility,
      defaultKey: channel.defaultKey ?? null,
      participantPlayerIds: (channel.participantPlayerIds ?? []).map(id),
      archived: channel.archived,
      unreadCount: await this.unreadCount(id(channel._id), playerId),
      lastReadMessageId: marker?.lastReadMessage ? id(marker.lastReadMessage) : null,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }

  private async replySummary(message: any): Promise<Record<string, any> | null> {
    if (!message.replyTo) return null;
    const parent = await ChatMessageModel.findOne({ _id: message.replyTo, campaign: message.campaign, channel: message.channel }).lean();
    if (!parent) return null;
    return {
      id: id(parent._id),
      author: {
        playerId: id(parent.author.player),
        displayName: parent.author.displayName,
        avatar: parent.author.avatar ?? null,
      },
      speaker: {
        type: parent.speaker.type,
        characterId: parent.speaker.character ? id(parent.speaker.character) : null,
        characterName: parent.speaker.characterName ?? null,
      },
      content: parent.deletedAt ? '' : parent.composition ? compositionParts(parent.composition).map((part) => part.text.trim()).filter(Boolean).join('\n') : parent.content,
      deletedAt: parent.deletedAt ?? null,
    };
  }

  private async legacyPortraits(messages: any[]): Promise<Map<string, string | null>> {
    // Only IDs referenced by an already-authorized page are queried, at most 100.
    // An explicit null snapshot stays null; old posts without the field use the
    // current portrait without disclosing any other character data.
    const ids = [...new Set(messages.filter((message) => !message.deletedAt && message.speaker.type === 'character' && message.speaker.avatar === undefined && message.speaker.character).map((message) => id(message.speaker.character)))];
    if (!ids.length) return new Map();
    const characters = await CharacterModel.find({ _id: { $in: ids } }).select('_id avatarUrl').lean();
    return new Map(characters.map((character) => [id(character._id), character.avatarUrl ?? null]));
  }

  private async messageDto(message: any, portraits?: Map<string, string | null>): Promise<Record<string, any>> {
    const legacy = portraits ?? await this.legacyPortraits([message]);
    return {
      id: id(message._id),
      campaignId: id(message.campaign),
      channelId: id(message.channel),
      clientMessageId: message.clientMessageId,
      origin: message.origin,
      author: {
        playerId: id(message.author.player),
        displayName: message.author.displayName,
        avatar: message.author.avatar ?? null,
      },
      speaker: {
        type: message.speaker.type,
        characterId: message.speaker.character ? id(message.speaker.character) : null,
        characterName: message.speaker.characterName ?? null,
        avatar: message.deletedAt || message.speaker.type !== 'character' ? null : message.speaker.avatar !== undefined ? message.speaker.avatar : legacy.get(id(message.speaker.character)) ?? null,
      },
      content: message.deletedAt ? '' : message.content,
      ...(!message.deletedAt && message.composition ? { composition: message.composition.parts ? { parts: message.composition.parts.map((part: any) => ({ type: part.type, text: part.text })) } : { action: message.composition.action, dialogue: message.composition.dialogue } } : {}),
      replyToMessageId: message.replyTo ? id(message.replyTo) : null,
      replyTo: await this.replySummary(message),
      editedAt: message.editedAt ?? null,
      deletedAt: message.deletedAt ?? null,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  private emitChannelInvalidation(channel: any, campaign: any): void {
    emitChatToPlayers(channelRecipients(channel, campaign), 'chat:channel:updated', {
      campaignId: id(campaign._id),
      channelId: id(channel._id),
    });
  }

  private async emitUnreadUpdates(channel: any, campaign: any): Promise<void> {
    const currentCampaign = await CampaignModel.findById(campaign._id).lean();
    const currentChannel = await ChatChannelModel.findById(channel._id).lean();
    if (!currentCampaign || !currentChannel) return;
    for (const playerId of channelRecipients(currentChannel, currentCampaign)) {
      const marker = await ChatReadMarkerModel.findOne({ channel: channel._id, player: playerId }).lean();
      emitChatToPlayers([playerId], 'chat:unread:updated', {
        campaignId: id(campaign._id),
        channelId: id(channel._id),
        unreadCount: await this.unreadCount(id(channel._id), playerId),
        lastReadMessageId: marker?.lastReadMessage ? id(marker.lastReadMessage) : null,
      });
    }
  }

  setup = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    await this.requireWritableCampaign(context);
    if (!isStoryweaver(context.role)) throw new ErrorUtil('Only campaign Storyweavers may initialize chat', 403);
    const campaign = context.campaign;
    const created = await Promise.all((['ic', 'ooc'] as ChatMode[]).map((key) =>
      ChatChannelModel.findOneAndUpdate(
        { campaign: campaign._id, defaultKey: key },
        { $setOnInsert: { campaign: campaign._id, defaultKey: key, name: defaultChannelName(key), mode: key, visibility: 'campaign', participantPlayerIds: [], archived: false } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      )
    ));
    created.forEach((channel) => this.emitChannelInvalidation(channel, campaign));
    const payload = await Promise.all(created.map((channel) => this.channelDto(channel, context)));
    return { status: 200, body: { success: true, payload } };
  };

  listChannels = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    const channels = await ChatChannelModel.find({ campaign: context.campaign._id }).sort({ createdAt: 1 }).lean();
    const visible = channels.filter((channel) => canReadChannel(channel, id(context.player._id), context.role));
    const payload = await Promise.all(visible.map((channel) => this.channelDto(channel, context)));
    return { status: 200, body: { success: true, payload } };
  };

  createChannel = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    await this.requireWritableCampaign(context);
    if (!isStoryweaver(context.role)) throw new ErrorUtil('Only campaign Storyweavers may manage chat channels', 403);
    const name = requireNonEmpty(req.body.name, 'Channel name', MAX_CHANNEL_NAME_LENGTH);
    const mode = req.body.mode as ChatMode;
    const visibility = req.body.visibility as ChatVisibility;
    if (!['ic', 'ooc'].includes(mode)) throw new ErrorUtil('Invalid channel mode', 400);
    if (!['campaign', 'private'].includes(visibility)) throw new ErrorUtil('Invalid channel visibility', 400);
    const participantPlayerIds = this.validateParticipantIds(req.body.participantPlayerIds, context.campaign, visibility);
    const channel = await ChatChannelModel.create({
      campaign: context.campaign._id,
      name,
      mode,
      visibility,
      defaultKey: null,
      participantPlayerIds,
      archived: false,
    });
    this.emitChannelInvalidation(channel, context.campaign);
    return { status: 201, body: { success: true, payload: await this.channelDto(channel, context) } };
  };

  updateChannel = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    await this.requireWritableCampaign(context);
    if (!isStoryweaver(context.role)) throw new ErrorUtil('Only campaign Storyweavers may manage chat channels', 403);
    const channel = await this.channelFor(context, req.params.channelId);
    const body = req.body ?? {};
    if (Object.keys(body).some((key) => !['name', 'participantPlayerIds', 'archived'].includes(key))) {
      throw new ErrorUtil('Only name, participantPlayerIds, and archived can be changed', 400);
    }
    if (channel.archived && (body.archived !== false || Object.keys(body).some((key) => key !== 'archived'))) {
      throw new ErrorUtil('Archived channels are read-only; reopen the channel first', 403);
    }
    const previousParticipants = channel.participantPlayerIds.map(id);
    if (body.name !== undefined) channel.name = requireNonEmpty(body.name, 'Channel name', MAX_CHANNEL_NAME_LENGTH);
    if (body.participantPlayerIds !== undefined) {
      channel.participantPlayerIds = this.validateParticipantIds(body.participantPlayerIds, context.campaign, channel.visibility) as any;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== 'boolean') throw new ErrorUtil('archived must be a boolean', 400);
      channel.archived = body.archived;
    }
    await channel.save();
    const affectedIds = [...new Set([...channelRecipients(channel, context.campaign), ...previousParticipants, ...(body.participantPlayerIds ?? []).map(String)])];
    emitChatToPlayers(affectedIds, 'chat:access:changed', {
      campaignId: id(context.campaign._id),
      channelIds: [id(channel._id)],
      reason: 'channel_membership_changed',
    });
    this.emitChannelInvalidation(channel, context.campaign);
    return { status: 200, body: { success: true, payload: await this.channelDto(channel, context) } };
  };

  listMessages = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    const channel = await this.channelFor(context, req.params.channelId);
    const limitRaw = Number(req.query.limit) || DEFAULT_PAGE_SIZE;
    const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limitRaw)));
    const filter: Record<string, any> = { campaign: context.campaign._id, channel: channel._id };
    if (req.query.before !== undefined) {
      const cursor = validId(req.query.before, 'message cursor');
      filter._id = { $lt: cursor };
    }
    const rows = await ChatMessageModel.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    const portraits = await this.legacyPortraits(page);
    const payload = await Promise.all(page.map((message) => this.messageDto(message, portraits)));
    return {
      status: 200,
      body: { success: true, payload, metadata: { nextCursor: page.length ? id(page[0]._id) : null, hasMore } },
    };
  };

  sendMessage = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    await this.requireWritableCampaign(context);
    const channel = await this.channelFor(context, req.params.channelId);
    if (channel.archived) throw new ErrorUtil('Archived channels are read-only', 403);
    if (context.role === 'observer') throw new ErrorUtil('Observers may read chat but cannot post', 403);
    const clientMessageId = requireNonEmpty(req.body.clientMessageId, 'clientMessageId', 128);
    const authorId = id(context.player._id);
    const speaker = await this.resolveSpeaker(channel.mode, req.body.speaker, context);
    const { content, composition } = messageContent(req.body, speaker.type);
    const replyToId = req.body.replyToMessageId == null ? null : validId(req.body.replyToMessageId, 'reply message ID');

    const existing = await ChatMessageModel.findOne({ channel: channel._id, 'author.player': authorId, clientMessageId }).lean();
    if (existing) {
      if (existing.content !== content || !sameComposition(existing.composition, composition) || id(existing.replyTo ?? '') !== String(replyToId ?? '') || existing.speaker.type !== speaker.type || id(existing.speaker.character ?? '') !== id(speaker.character ?? '')) {
        throw new ErrorUtil('clientMessageId was already used for a different message', 409);
      }
      return { status: 200, body: { success: true, payload: await this.messageDto(existing) } };
    }

    let replyTo: mongoose.Types.ObjectId | null = null;
    if (replyToId) {
      const parent = await ChatMessageModel.findOne({ _id: replyToId, channel: channel._id, deletedAt: null });
      if (!parent) throw new ErrorUtil('Reply target not found in this channel', 404);
      replyTo = parent._id;
    }

    let message: ChatMessageDoc;
    try {
      message = await ChatMessageModel.create({
        campaign: context.campaign._id,
        channel: channel._id,
        clientMessageId,
        origin: 'web',
        author: { player: context.player._id, displayName: (context.player.displayName || 'Unknown').slice(0, 80), avatar: context.player.avatar ?? null },
        speaker,
        content,
        composition,
        replyTo,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const raced = await ChatMessageModel.findOne({ channel: channel._id, 'author.player': authorId, clientMessageId }).lean();
      if (raced && raced.content === content && sameComposition(raced.composition, composition) && id(raced.replyTo ?? '') === String(replyToId ?? '') && raced.speaker.type === speaker.type && id(raced.speaker.character ?? '') === id(speaker.character ?? '')) {
        return { status: 200, body: { success: true, payload: await this.messageDto(raced) } };
      }
      throw new ErrorUtil('clientMessageId was already used for a different message', 409);
    }

    const dto = await this.messageDto(message.toObject());
    const currentCampaign = await CampaignModel.findById(context.campaign._id).lean();
    const currentChannel = await ChatChannelModel.findById(channel._id).lean();
    const recipients = currentCampaign && currentChannel ? channelRecipients(currentChannel, currentCampaign) : [];
    emitChatToPlayers(recipients, 'chat:message:created', { campaignId: id(context.campaign._id), channelId: id(channel._id), message: dto });
    await this.emitUnreadUpdates(channel, context.campaign);
    return { status: 201, body: { success: true, payload: dto } };
  };

  updateMessage = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    await this.requireWritableCampaign(context);
    if (context.role === 'observer') throw new ErrorUtil('Observers may not edit chat messages', 403);
    const messageId = validId(req.params.messageId, 'message ID');
    const message = await ChatMessageModel.findOne({ _id: messageId, campaign: context.campaign._id });
    if (!message || message.deletedAt) throw new ErrorUtil('Chat message not found', 404);
    const channel = await ChatChannelModel.findOne({ _id: message.channel, campaign: context.campaign._id });
    if (!channel || !canReadChannel(channel, id(context.player._id), context.role)) throw new ErrorUtil('Chat message not found', 404);
    if (channel.archived) throw new ErrorUtil('Archived channels are read-only', 403);
    if (id(message.author.player) !== id(context.player._id)) throw new ErrorUtil('You may only edit your own messages', 403);
    const edited = messageContent(req.body, message.speaker.type);
    message.content = edited.content;
    message.composition = edited.composition;
    message.editedAt = new Date();
    await message.save();
    const dto = await this.messageDto(message.toObject());
    const currentCampaign = await CampaignModel.findById(context.campaign._id).lean();
    const currentChannel = await ChatChannelModel.findById(channel._id).lean();
    emitChatToPlayers(currentCampaign && currentChannel ? channelRecipients(currentChannel, currentCampaign) : [], 'chat:message:updated', {
      campaignId: id(context.campaign._id), channelId: id(channel._id), message: dto,
    });
    return { status: 200, body: { success: true, payload: dto } };
  };

  deleteMessage = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    await this.requireWritableCampaign(context);
    if (context.role === 'observer') throw new ErrorUtil('Observers may not remove chat messages', 403);
    const messageId = validId(req.params.messageId, 'message ID');
    const message = await ChatMessageModel.findOne({ _id: messageId, campaign: context.campaign._id });
    if (!message || message.deletedAt) throw new ErrorUtil('Chat message not found', 404);
    const channel = await ChatChannelModel.findOne({ _id: message.channel, campaign: context.campaign._id });
    if (!channel || !canReadChannel(channel, id(context.player._id), context.role)) throw new ErrorUtil('Chat message not found', 404);
    if (channel.archived) throw new ErrorUtil('Archived channels are read-only', 403);
    const ownMessage = id(message.author.player) === id(context.player._id);
    if (!ownMessage && !isStoryweaver(context.role)) throw new ErrorUtil('Only Storyweavers may remove another player’s message', 403);
    message.content = '';
    message.composition = undefined;
    message.deletedAt = new Date();
    await message.save();
    const dto = await this.messageDto(message.toObject());
    const currentCampaign = await CampaignModel.findById(context.campaign._id).lean();
    const currentChannel = await ChatChannelModel.findById(channel._id).lean();
    emitChatToPlayers(currentCampaign && currentChannel ? channelRecipients(currentChannel, currentCampaign) : [], 'chat:message:deleted', {
      campaignId: id(context.campaign._id), channelId: id(channel._id), message: dto,
    });
    await this.emitUnreadUpdates(channel, context.campaign);
    return { status: 200, body: { success: true, payload: dto } };
  };

  markRead = async (req: AuthenticatedRequest): Promise<ChatHttpResult> => {
    const context = await this.context(req);
    const channel = await this.channelFor(context, req.params.channelId);
    const throughId = validId(req.body.throughMessageId, 'throughMessageId');
    const through = await ChatMessageModel.findOne({ _id: throughId, campaign: context.campaign._id, channel: channel._id }).lean();
    if (!through) throw new ErrorUtil('Read marker message not found in this channel', 404);
    await ChatReadMarkerModel.findOneAndUpdate(
      { channel: channel._id, player: context.player._id },
      { $setOnInsert: { campaign: context.campaign._id }, $max: { lastReadMessage: through._id } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    const marker = await ChatReadMarkerModel.findOne({ channel: channel._id, player: context.player._id }).lean();
    const payload = {
      campaignId: id(context.campaign._id),
      channelId: id(channel._id),
      lastReadMessageId: marker?.lastReadMessage ? id(marker.lastReadMessage) : null,
      unreadCount: await this.unreadCount(id(channel._id), id(context.player._id)),
    };
    emitChatToPlayers([id(context.player._id)], 'chat:unread:updated', payload);
    return { status: 200, body: { success: true, payload } };
  };

  private validateParticipantIds(input: unknown, campaign: any, visibility: ChatVisibility): mongoose.Types.ObjectId[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) throw new ErrorUtil('participantPlayerIds must be an array', 400);
    if (visibility === 'campaign' && input.length > 0) throw new ErrorUtil('Campaignwide channels do not use participant assignments', 400);
    const members = new Set(memberPlayerIds(campaign));
    const ids = input.map((value) => validId(value, 'participant player ID'));
    if (ids.some((playerId) => !members.has(playerId))) throw new ErrorUtil('Channel participants must be current campaign members', 400);
    return [...new Set(ids)].map((playerId) => new mongoose.Types.ObjectId(playerId));
  }

  private async resolveSpeaker(mode: ChatMode, input: any, context: ChatContext): Promise<{ type: ChatSpeakerType; character?: mongoose.Types.ObjectId | null; characterName?: string | null; avatar?: string | null }> {
    if (mode === 'ooc') {
      if (input !== undefined) throw new ErrorUtil('OOC speaker is derived from the authenticated profile', 400);
      return { type: 'profile', character: null, characterName: null };
    }
    if (!input || typeof input !== 'object') throw new ErrorUtil('IC messages require a speaker', 400);
    if (input.type === 'narrator') {
      if (!isStoryweaver(context.role)) throw new ErrorUtil('Only Storyweavers may speak as narrator', 403);
      return { type: 'narrator', character: null, characterName: 'Narrator' };
    }
    if (input.type !== 'character') throw new ErrorUtil('Invalid IC speaker', 400);
    const characterId = validId(input.characterId, 'character ID');
    const character = await CharacterModel.findOne({ _id: characterId, player: context.player._id, campaign: context.campaign._id, status: 'active' }).lean();
    if (!character) throw new ErrorUtil('IC speakers must be your own active character attached to this campaign', 403);
    return { type: 'character', character: character._id, characterName: character.name, avatar: character.avatarUrl ?? null };
  }
}

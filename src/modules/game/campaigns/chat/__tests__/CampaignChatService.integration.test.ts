import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import CampaignChatService from '../CampaignChatService';
import CampaignModel from '../../model/CampaignModel';
import ChatChannelModel from '../../model/ChatChannelModel';
import ChatMessageModel from '../../model/ChatMessageModel';
import ChatReadMarkerModel from '../../model/ChatReadMarkerModel';
import CharacterModel from '../../../characters/model/CharacterModel';
import PlayerModel from '../../../../profiles/player/model/PlayerModel';
import { revokeCampaignChatMember } from '../chatEvents';
import { CampaignHandler } from '../../handlers/Campaign.handler';

const integration = process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY ? describe : describe.skip;

integration('campaign chat privacy, identity, and persistence (isolated MongoDB)', () => {
  let mongo: MongoMemoryServer;
  const service = new CampaignChatService();
  let campaignId: string;
  let swUserId: mongoose.Types.ObjectId;
  let swPlayerId: string;
  let playerAUserId: mongoose.Types.ObjectId;
  let playerAId: string;
  let playerBUserId: mongoose.Types.ObjectId;
  let playerBId: string;
  let coSwUserId: mongoose.Types.ObjectId;
  let coSwPlayerId: string;
  let privateChannelId: string;
  let campaignChannelId: string;
  let playerACharacterId: string;

  const invoke = (handler: any, userId: mongoose.Types.ObjectId, params: Record<string, string> = {}, body: any = {}, query: any = {}) =>
    new Promise<{ status: number; payload: any }>((resolve, reject) => {
      const res: any = {
        code: 200,
        status(code: number) { this.code = code; return this; },
        json(payload: any) { resolve({ status: this.code, payload }); return this; },
      };
      const req: any = { user: { _id: userId }, params, body, query };
      handler(req, res, reject);
    });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({
      binary: { systemBinary: process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY! },
      instance: { dbName: 'tapestry_chat_test' },
    });
    await mongoose.connect(mongo.getUri('tapestry_chat_test'));
    await Promise.all([
      CampaignModel.init(), ChatChannelModel.init(), ChatMessageModel.init(), ChatReadMarkerModel.init(),
      PlayerModel.init(), CharacterModel.init(),
    ]);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      CampaignModel.deleteMany({}), ChatChannelModel.deleteMany({}), ChatMessageModel.deleteMany({}),
      ChatReadMarkerModel.deleteMany({}), PlayerModel.deleteMany({}), CharacterModel.deleteMany({}),
    ]);
    swUserId = new mongoose.Types.ObjectId();
    playerAUserId = new mongoose.Types.ObjectId();
    playerBUserId = new mongoose.Types.ObjectId();
    coSwUserId = new mongoose.Types.ObjectId();
    swPlayerId = String((await new PlayerModel({ user: swUserId, roles: ['storyweaver'], displayName: 'Weaver' }).save())._id);
    playerAId = String((await new PlayerModel({ user: playerAUserId, roles: ['player'], displayName: 'Player A' }).save())._id);
    playerBId = String((await new PlayerModel({ user: playerBUserId, roles: ['player'], displayName: 'Player B' }).save())._id);
    coSwPlayerId = String((await new PlayerModel({ user: coSwUserId, roles: ['storyweaver'], displayName: 'Co-weaver' }).save())._id);
    const campaign: any = await new CampaignModel({
      name: 'Test campaign', status: 'active', owner: swPlayerId,
      members: [
        { player: swPlayerId, role: 'sw', characters: [] },
        { player: playerAId, role: 'player', characters: [] },
        { player: playerBId, role: 'player', characters: [] },
        { player: coSwPlayerId, role: 'co-sw', characters: [] },
      ],
    }).save();
    campaignId = String(campaign._id);
    const campaignChannel: any = await new ChatChannelModel({ campaign: campaignId, name: 'In Character', mode: 'ic', visibility: 'campaign', defaultKey: 'ic' }).save();
    campaignChannelId = String(campaignChannel._id);
    const privateChannel: any = await new ChatChannelModel({ campaign: campaignId, name: 'Private', mode: 'ic', visibility: 'private', participantPlayerIds: [playerAId] }).save();
    privateChannelId = String(privateChannel._id);
    playerACharacterId = String((await new CharacterModel({ player: playerAId, campaign: campaignId, name: 'Aster', status: 'active' }).save())._id);
  });

  it('hides private channels from unassigned players while keeping them visible to Storyweavers', async () => {
    const forB = await invoke(service.listChannels, playerBUserId, { campaignId });
    expect(forB.payload.payload.map((channel: any) => channel.id)).toContain(campaignChannelId);
    expect(forB.payload.payload.map((channel: any) => channel.id)).not.toContain(privateChannelId);

    const forSw = await invoke(service.listChannels, swUserId, { campaignId });
    expect(forSw.payload.payload.map((channel: any) => channel.id)).toContain(privateChannelId);

    const forCoSw = await invoke(service.listChannels, coSwUserId, { campaignId });
    expect(forCoSw.payload.payload.map((channel: any) => channel.id)).toContain(privateChannelId);
    await expect(invoke(service.listMessages, playerBUserId, { campaignId, channelId: privateChannelId })).rejects.toMatchObject({ statusCode: 403 });
    await expect(invoke(service.sendMessage, playerBUserId, { campaignId, channelId: privateChannelId }, {
      clientMessageId: 'private-probe', content: 'Can you see this?', speaker: { type: 'narrator' },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('paginates private history without overlap and grants a newly assigned participant the full backscroll', async () => {
    const messageIds: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      const result = await invoke(service.sendMessage, playerAUserId, { campaignId, channelId: privateChannelId }, {
        clientMessageId: `private-history-${index}`,
        content: `Private history ${index}`,
        speaker: { type: 'character', characterId: playerACharacterId },
      });
      messageIds.push(result.payload.payload.id);
    }

    await expect(invoke(service.listMessages, playerBUserId, { campaignId, channelId: privateChannelId })).rejects.toMatchObject({ statusCode: 403 });

    await invoke(service.updateChannel, swUserId, { campaignId, channelId: privateChannelId }, {
      participantPlayerIds: [playerAId, playerBId],
    });

    const newestPage = await invoke(service.listMessages, playerBUserId, { campaignId, channelId: privateChannelId }, {}, { limit: '2' });
    expect(newestPage.payload.payload.map((message: any) => message.id)).toEqual(messageIds.slice(3, 5));
    expect(newestPage.payload.metadata.hasMore).toBe(true);

    const middlePage = await invoke(service.listMessages, playerBUserId, { campaignId, channelId: privateChannelId }, {}, {
      limit: '2', before: newestPage.payload.metadata.nextCursor,
    });
    const oldestPage = await invoke(service.listMessages, playerBUserId, { campaignId, channelId: privateChannelId }, {}, {
      limit: '2', before: middlePage.payload.metadata.nextCursor,
    });
    const pagedIds = [
      ...oldestPage.payload.payload.map((message: any) => message.id),
      ...middlePage.payload.payload.map((message: any) => message.id),
      ...newestPage.payload.payload.map((message: any) => message.id),
    ];
    expect(oldestPage.payload.payload.map((message: any) => message.id)).toEqual(messageIds.slice(0, 1));
    expect(middlePage.payload.payload.map((message: any) => message.id)).toEqual(messageIds.slice(1, 3));
    expect(new Set(pagedIds).size).toBe(5);
    expect(pagedIds).toEqual(messageIds);
    expect(oldestPage.payload.metadata.hasMore).toBe(false);
  });

  it('rejects another player’s character and client-supplied OOC identity', async () => {
    await expect(invoke(service.sendMessage, playerBUserId, { campaignId, channelId: campaignChannelId }, {
      clientMessageId: 'wrong-character', content: 'hello', speaker: { type: 'character', characterId: playerACharacterId },
    })).rejects.toMatchObject({ statusCode: 403 });
    await expect(invoke(service.sendMessage, swUserId, { campaignId, channelId: campaignChannelId }, {
      clientMessageId: 'sw-impersonation', content: 'hello', speaker: { type: 'character', characterId: playerACharacterId },
    })).rejects.toMatchObject({ statusCode: 403 });

    const ooc: any = await new ChatChannelModel({ campaign: campaignId, name: 'Out of Character', mode: 'ooc', visibility: 'campaign', defaultKey: 'ooc' }).save();
    await expect(invoke(service.sendMessage, playerAUserId, { campaignId, channelId: String(ooc._id) }, {
      clientMessageId: 'spoof-ooc', content: 'hello', speaker: { type: 'narrator' },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('persists once for a repeated client id and rejects a conflicting reuse', async () => {
    const body = {
      clientMessageId: 'device-message-1', content: 'A line in the scene',
      speaker: { type: 'character', characterId: playerACharacterId },
    };
    const first = await invoke(service.sendMessage, playerAUserId, { campaignId, channelId: campaignChannelId }, body);
    const retry = await invoke(service.sendMessage, playerAUserId, { campaignId, channelId: campaignChannelId }, body);
    expect(first.payload.payload.id).toBe(retry.payload.payload.id);
    expect(await ChatMessageModel.countDocuments({ channel: campaignChannelId })).toBe(1);

    await expect(invoke(service.sendMessage, playerAUserId, { campaignId, channelId: campaignChannelId }, {
      ...body, content: 'Different content',
    })).rejects.toMatchObject({ statusCode: 409 });

    const edited = await invoke(service.updateMessage, playerAUserId, { campaignId, messageId: first.payload.payload.id }, { content: 'Edited line' });
    expect(edited.payload.payload.content).toBe('Edited line');
    expect(edited.payload.payload.editedAt).toBeTruthy();
    const removedBySw = await invoke(service.deleteMessage, swUserId, { campaignId, messageId: first.payload.payload.id });
    expect(removedBySw.payload.payload.deletedAt).toBeTruthy();
  });

  it('removes private assignment on campaign removal and does not restore it when they rejoin', async () => {
    const campaign = await CampaignModel.findById(campaignId);
    campaign!.members = campaign!.members.filter((member: any) => String(member.player) !== playerAId) as any;
    await campaign!.save();
    await revokeCampaignChatMember(campaignId, playerAId);

    await expect(invoke(service.listChannels, playerAUserId, { campaignId })).rejects.toMatchObject({ statusCode: 403 });

    campaign!.members.push({ player: new mongoose.Types.ObjectId(playerAId), role: 'player', characters: [] } as any);
    await campaign!.save();
    const afterRejoin = await invoke(service.listChannels, playerAUserId, { campaignId });
    expect(afterRejoin.payload.payload.map((channel: any) => channel.id)).not.toContain(privateChannelId);
  });

  it('keeps read markers monotonic and permits them for archived history', async () => {
    const first: any = await new ChatMessageModel({
      campaign: campaignId, channel: campaignChannelId, clientMessageId: 'sw-1', origin: 'web',
      author: { player: swPlayerId, displayName: 'Weaver' }, speaker: { type: 'narrator' }, content: 'First',
    }).save();
    const second: any = await new ChatMessageModel({
      campaign: campaignId, channel: campaignChannelId, clientMessageId: 'sw-2', origin: 'web',
      author: { player: swPlayerId, displayName: 'Weaver' }, speaker: { type: 'narrator' }, content: 'Second',
    }).save();
    await invoke(service.markRead, playerAUserId, { campaignId, channelId: campaignChannelId }, { throughMessageId: String(second._id) });
    await invoke(service.markRead, playerAUserId, { campaignId, channelId: campaignChannelId }, { throughMessageId: String(first._id) });
    await CampaignModel.updateOne({ _id: campaignId }, { status: 'archived' });
    const result = await invoke(service.markRead, playerAUserId, { campaignId, channelId: campaignChannelId }, { throughMessageId: String(second._id) });
    expect(result.payload.payload.lastReadMessageId).toBe(String(second._id));
  });

  it('lets observers read and mark history while denying content and channel changes', async () => {
    await CampaignModel.updateOne({ _id: campaignId, 'members.player': playerBId } as any, { $set: { 'members.$.role': 'observer' } });
    const ownMessage = await new ChatMessageModel({
      campaign: campaignId, channel: campaignChannelId, clientMessageId: 'observer-old', origin: 'web',
      author: { player: playerBId, displayName: 'Player B' }, speaker: { type: 'profile' }, content: 'Historical post',
    }).save();
    const history = await invoke(service.listMessages, playerBUserId, { campaignId, channelId: campaignChannelId });
    expect(history.payload.payload).toHaveLength(1);
    const read = await invoke(service.markRead, playerBUserId, { campaignId, channelId: campaignChannelId }, { throughMessageId: String(ownMessage._id) });
    expect(read.payload.payload.lastReadMessageId).toBe(String(ownMessage._id));

    await expect(invoke(service.sendMessage, playerBUserId, { campaignId, channelId: campaignChannelId }, {
      clientMessageId: 'observer-new', content: 'No',
    })).rejects.toMatchObject({ statusCode: 403 });
    await expect(invoke(service.updateMessage, playerBUserId, { campaignId, messageId: String(ownMessage._id) }, { content: 'No' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(invoke(service.deleteMessage, playerBUserId, { campaignId, messageId: String(ownMessage._id) })).rejects.toMatchObject({ statusCode: 403 });
    await expect(invoke(service.updateChannel, playerBUserId, { campaignId, channelId: campaignChannelId }, { name: 'No' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('reuses default channels without unarchiving or overwriting renamed defaults', async () => {
    const channel = await ChatChannelModel.findById(campaignChannelId);
    channel!.name = 'The Scene';
    channel!.archived = true;
    await channel!.save();

    const first = await invoke(service.setup, swUserId, { campaignId });
    const second = await invoke(service.setup, swUserId, { campaignId });
    expect(await ChatChannelModel.countDocuments({ campaign: campaignId, defaultKey: { $in: ['ic', 'ooc'] } })).toBe(2);
    expect(first.payload.payload.find((entry: any) => entry.defaultKey === 'ic').id).toBe(campaignChannelId);
    expect(second.payload.payload.find((entry: any) => entry.defaultKey === 'ic').name).toBe('The Scene');
    expect(second.payload.payload.find((entry: any) => entry.defaultKey === 'ic').archived).toBe(true);
  });

  it('updates reply summaries after tombstoning a parent and blocks archived-channel writes', async () => {
    const first = await invoke(service.sendMessage, playerAUserId, { campaignId, channelId: campaignChannelId }, {
      clientMessageId: 'reply-parent', content: 'A line', speaker: { type: 'character', characterId: playerACharacterId },
    });
    const reply = await invoke(service.sendMessage, playerAUserId, { campaignId, channelId: campaignChannelId }, {
      clientMessageId: 'reply-child', content: 'A response', replyToMessageId: first.payload.payload.id,
      speaker: { type: 'character', characterId: playerACharacterId },
    });
    expect(reply.payload.payload.replyTo.content).toBe('A line');

    const tombstone = await invoke(service.deleteMessage, playerAUserId, { campaignId, messageId: first.payload.payload.id });
    expect(tombstone.payload.payload.content).toBe('');
    expect(tombstone.payload.payload.deletedAt).toBeTruthy();
    const history = await invoke(service.listMessages, playerAUserId, { campaignId, channelId: campaignChannelId });
    expect(history.payload.payload[1].replyTo.content).toBe('');
    expect(history.payload.payload[1].replyTo.deletedAt).toBeTruthy();

    await invoke(service.updateChannel, swUserId, { campaignId, channelId: campaignChannelId }, { archived: true });
    await expect(invoke(service.sendMessage, playerAUserId, { campaignId, channelId: campaignChannelId }, {
      clientMessageId: 'archived-channel-message', content: 'No', speaker: { type: 'character', characterId: playerACharacterId },
    })).rejects.toMatchObject({ statusCode: 403 });
    await invoke(service.markRead, playerAUserId, { campaignId, channelId: campaignChannelId }, { throughMessageId: reply.payload.payload.id });
    await expect(invoke(service.updateChannel, swUserId, { campaignId, channelId: campaignChannelId }, { name: 'Not while archived' })).rejects.toMatchObject({ statusCode: 403 });
    await invoke(service.updateChannel, swUserId, { campaignId, channelId: campaignChannelId }, { archived: false });
  });

  it('rejects membership replacement through generic campaign update', async () => {
    await expect(new CampaignHandler().update(campaignId, { members: [] })).rejects.toMatchObject({ statusCode: 400 });
  });
});

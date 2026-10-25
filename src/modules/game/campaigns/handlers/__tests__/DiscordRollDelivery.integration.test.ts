import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import RollLogModel from '../../../characters/model/RollLog';
import { RollHandler } from '../../../characters/handlers/Roll.handler';
import CampaignModel from '../../model/CampaignModel';
import PlayerModel from '../../../../profiles/player/model/PlayerModel';
import { DiscordConnectionModel } from '../../model/DiscordIntegrationModel';
import DiscordDeliveryGate from '../../model/DiscordDeliveryGateModel';
import { initializeDiscordRollDelivery, prepareDiscordRollDelivery, processNextDiscordRoll } from '../DiscordRollDelivery.handler';
import DiceRollerService from '../../../utils/diceRoller/DiceRollerService';

const integration = process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY ? describe : describe.skip;
const CHANNEL = '123456789012345678';
const GUILD = '223456789012345678';
const MESSAGE = '323456789012345678';
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });

integration('Discord roll delivery (isolated MongoDB, mocked Discord)', () => {
  let mongo: MongoMemoryServer;
  let playerId: mongoose.Types.ObjectId;
  let campaignId: mongoose.Types.ObjectId;
  let connectionId: mongoose.Types.ObjectId;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const originalToken = process.env.DISCORD_BOT_TOKEN;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { systemBinary: process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY! }, instance: { dbName: 'discord_roll_test' } });
    await mongoose.connect(mongo.getUri('discord_roll_test'));
    await Promise.all([RollLogModel.init(), CampaignModel.init(), PlayerModel.init(), DiscordConnectionModel.init(), DiscordDeliveryGate.init()]);
  }, 60000);
  afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); if (originalToken === undefined) delete process.env.DISCORD_BOT_TOKEN; else process.env.DISCORD_BOT_TOKEN = originalToken; });
  beforeEach(async () => {
    await Promise.all([RollLogModel.deleteMany({}), CampaignModel.deleteMany({}), PlayerModel.deleteMany({}), DiscordConnectionModel.deleteMany({}), DiscordDeliveryGate.deleteMany({})]);
    process.env.DISCORD_BOT_TOKEN = 'isolated-test-token';
    playerId = (await new PlayerModel({ user: new mongoose.Types.ObjectId(), displayName: 'Actual player' }).save())._id as mongoose.Types.ObjectId;
    campaignId = (await new CampaignModel({ name: 'Test table', owner: playerId, status: 'active', members: [{ player: playerId, role: 'sw' }] }).save())._id as mongoose.Types.ObjectId;
    connectionId = (await DiscordConnectionModel.create({ campaign: campaignId, guildId: GUILD, guildName: 'Test guild', mappings: { rolls: { discordChannelId: CHANNEL, discordChannelName: 'rolls' } } }))._id;
    await initializeDiscordRollDelivery();
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'POST' ? json({ id: MESSAGE }) : json({ id: CHANNEL, guild_id: GUILD, type: 0 }));
  });
  afterEach(() => { jest.restoreAllMocks(); });
  const queuedRoll = async () => RollLogModel.create({ campaign: campaignId, player: playerId, character: null, expression: '3d6', total: 12, allRolls: [3, 4, 5], keptRolls: [3, 4, 5], rollType: 'approach', rolledAt: new Date(), discordDelivery: await prepareDiscordRollDelivery({ id: campaignId.toString(), name: 'Test table' }, playerId.toString()) });
  const state = async (id: unknown) => (await RollLogModel.findById(id).select('+discordDelivery').lean())?.discordDelivery;
  const posts = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');

  it('skips personal/unmapped rolls and never backfills old saved rolls', async () => {
    expect(await prepareDiscordRollDelivery(null, playerId.toString())).toBeUndefined();
    await DiscordConnectionModel.deleteMany({});
    expect(await prepareDiscordRollDelivery({ id: campaignId.toString(), name: 'Test table' }, playerId.toString())).toBeUndefined();
    await RollLogModel.create({ campaign: campaignId, player: playerId, expression: '1d6', total: 3, allRolls: [3], keptRolls: [3] });
    await DiscordConnectionModel.create({ campaign: campaignId, guildId: GUILD, guildName: 'Test guild', mappings: { rolls: { discordChannelId: CHANNEL, discordChannelName: 'rolls' } } });
    await processNextDiscordRoll();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('atomically claims once across competing workers and resumes pending durable work', async () => {
    const roll = await queuedRoll();
    await initializeDiscordRollDelivery(); // a restarted worker does not reset a pending job/gate
    await Promise.all(Array.from({ length: 8 }, () => processNextDiscordRoll()));
    expect(posts()).toHaveLength(1);
    expect(await state(roll._id)).toMatchObject({ state: 'sent', attempts: 1, messageId: MESSAGE });
    const body = JSON.parse(String(posts()[0][1]?.body));
    expect(body).toMatchObject({ nonce: roll._id.toString(), enforce_nonce: true, allowed_mentions: { parse: [], replied_user: false } });
    expect(posts()[0][0]).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages`);
    await processNextDiscordRoll();
    expect(posts()).toHaveLength(1);
  });

  it.each(['disconnect', 'remap', 'archive', 'delete'] as const)('cancels when destination access changes: %s', async (change) => {
    const roll = await queuedRoll();
    if (change === 'disconnect') await DiscordConnectionModel.deleteOne({ _id: connectionId });
    if (change === 'remap') await DiscordConnectionModel.updateOne({ _id: connectionId }, { $set: { 'mappings.rolls.discordChannelId': '423456789012345678' } });
    if (change === 'archive') await CampaignModel.updateOne({ _id: campaignId }, { $set: { status: 'archived' } });
    if (change === 'delete') await CampaignModel.deleteOne({ _id: campaignId });
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechecks the mapping after channel validation and never posts to a recreated connection', async () => {
    const roll = await queuedRoll();
    fetchMock.mockImplementationOnce(async () => {
      await DiscordConnectionModel.deleteOne({ _id: connectionId });
      await DiscordConnectionModel.create({ campaign: campaignId, guildId: GUILD, guildName: 'Reconnected', mappings: { rolls: { discordChannelId: CHANNEL, discordChannelName: 'rolls' } } });
      return json({ id: CHANNEL, guild_id: GUILD, type: 0 });
    });
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'cancelled' });
    expect(posts()).toHaveLength(0);
  });

  it('honors a shared429 cooldown, then safely retries the rejected POST', async () => {
    const roll = await queuedRoll();
    fetchMock.mockResolvedValueOnce(json({ id: CHANNEL, guild_id: GUILD, type: 0 })).mockResolvedValueOnce(json({ retry_after: 3, global: true }, 429, { 'retry-after': '2' }));
    const before = Date.now();
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'retry', attempts: 1 });
    expect((await state(roll._id))!.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before + 3000);
    await processNextDiscordRoll();
    expect(posts()).toHaveLength(1);
    await DiscordDeliveryGate.updateOne({ _id: 'campaign-rolls' }, { $set: { cooldownUntil: new Date(0) } });
    await RollLogModel.updateOne({ _id: roll._id }, { $set: { 'discordDelivery.nextAttemptAt': new Date(0) } });
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'sent', attempts: 2 });
  });

  it('finishes a validated POST when the GET bucket is exhausted, then paces later claims', async () => {
    const first = await queuedRoll();
    const second = await queuedRoll();
    fetchMock.mockResolvedValueOnce(json({ id: CHANNEL, guild_id: GUILD, type: 0 }, 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '5' }));
    await processNextDiscordRoll();
    expect(await state(first._id)).toMatchObject({ state: 'sent' });
    await processNextDiscordRoll();
    expect(await state(second._id)).toMatchObject({ state: 'pending' });
    expect(posts()).toHaveLength(1);
  });

  it.each([400, 401, 403, 404])('does not retry a permanent Discord response %s', async (status) => {
    const roll = await queuedRoll();
    fetchMock.mockResolvedValueOnce(json({ message: 'sensitive upstream text' }, status));
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'failed' });
    expect((await state(roll._id))?.lastError).not.toContain('sensitive');
    await processNextDiscordRoll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['timeout', 'server error'])('marks ambiguous POST %s uncertain without retry', async (failure) => {
    const roll = await queuedRoll();
    fetchMock.mockResolvedValueOnce(json({ id: CHANNEL, guild_id: GUILD, type: 0 }));
    if (failure === 'timeout') fetchMock.mockRejectedValueOnce(new Error('private transport detail'));
    else fetchMock.mockResolvedValueOnce(json({ message: 'upstream failure' }, 503));
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'uncertain' });
    await processNextDiscordRoll();
    expect(posts()).toHaveLength(1);
  });

  it('recovers expired in-flight jobs as uncertain without sending again', async () => {
    const roll = await queuedRoll();
    await RollLogModel.updateOne({ _id: roll._id }, { $set: { 'discordDelivery.state': 'sending', 'discordDelivery.claimToken': 'dead-worker', 'discordDelivery.leaseUntil': new Date(0) } });
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'uncertain' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a stale gate owner before POST and does not release the replacement owner', async () => {
    await queuedRoll();
    fetchMock.mockImplementationOnce(async () => {
      await DiscordDeliveryGate.updateOne({ _id: 'campaign-rolls' }, { $set: { token: 'replacement-worker', leaseUntil: new Date(Date.now() + 120000) } });
      return json({ id: CHANNEL, guild_id: GUILD, type: 0 });
    });
    await processNextDiscordRoll();
    expect(posts()).toHaveLength(0);
    expect(await DiscordDeliveryGate.findById('campaign-rolls').lean()).toMatchObject({ token: 'replacement-worker' });
  });

  it('keeps successful rolls saved when destination lookup fails and never backfills them', async () => {
    jest.spyOn(DiceRollerService.prototype, 'rollAdvanced').mockResolvedValue({ expression: '3d6', total: 12, allRolls: [3, 4, 5], keptRolls: [3, 4, 5], breakdown: '3 + 4 + 5' });
    const lookup = jest.spyOn(DiscordConnectionModel, 'findOne').mockReturnValueOnce({ lean: async () => { throw new Error('database unavailable'); } } as never);
    const result = await new RollHandler().createRoll({ campaignId: campaignId.toString(), playerId: playerId.toString(), diceCount: 3, faces: 6, rollType: 'custom' });
    lookup.mockRestore();
    expect(await state(result.rollId)).toMatchObject({ state: 'failed', attempts: 0 });
    expect(await RollLogModel.findById(result.rollId).lean()).toMatchObject({ total: result.total });
    await processNextDiscordRoll();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps delivery metadata out of campaign and generic history responses', async () => {
    await queuedRoll();
    const handler = new RollHandler();
    const options = { filters: [], query: [], sort: { rolledAt: -1 as const }, page: 1, limit: 10 };
    for (const scopedCampaign of [undefined, campaignId.toString()]) {
      const [result] = await handler.fetchAccessible(playerId.toString(), options, scopedCampaign);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).not.toHaveProperty('discordDelivery');
    }
  });

  it('refuses a channel that moved to another guild', async () => {
    const roll = await queuedRoll();
    fetchMock.mockResolvedValueOnce(json({ id: CHANNEL, guild_id: '923456789012345678', type: 0 }));
    await processNextDiscordRoll();
    expect(await state(roll._id)).toMatchObject({ state: 'cancelled' });
    expect(posts()).toHaveLength(0);
  });

  it('stops delivery outside the age or attempt window', async () => {
    const expired = await queuedRoll();
    const exhausted = await queuedRoll();
    await RollLogModel.updateOne({ _id: expired._id }, { $set: { 'discordDelivery.createdAt': new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    await RollLogModel.updateOne({ _id: exhausted._id }, { $set: { 'discordDelivery.attempts': 8 } });
    await processNextDiscordRoll();
    await processNextDiscordRoll();
    expect(await state(expired._id)).toMatchObject({ state: 'failed' });
    expect(await state(exhausted._id)).toMatchObject({ state: 'failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

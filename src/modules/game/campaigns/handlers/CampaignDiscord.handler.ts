import { createHash, randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CampaignModel from '../model/CampaignModel';
import ChatChannelModel from '../model/ChatChannelModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { DiscordAuthorizationModel, DiscordConnectionModel, DiscordStateModel } from '../model/DiscordIntegrationModel';
import { discordRequest, discordSettings, liveChannels, liveGuildAccess, mayManage, DiscordGuild } from '../utils/discordClient';
import RollLogModel from '../../characters/model/RollLog';
import { discordBotReady } from '../utils/discordBotClient';
import { discordRollWorkerRunning } from '../utils/discordRollWorker';

function objectId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ErrorUtil('Invalid campaign or chat channel ID.', 400);
  return value;
}
function snowflake(value: unknown) {
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value)) throw new ErrorUtil('Invalid Discord server or channel ID.', 400);
  return value;
}
const digest = (state: string) => createHash('sha256').update(state).digest('hex');
type Mapping = { chatChannelId?: string; chatChannelName?: string; discordChannelId: string; discordChannelName: string };
let indexesReady: Promise<unknown> | undefined;
function ensureIndexes() {
  // Fail closed if the unique reservation index cannot be created, including when autoIndex is disabled.
  if (!indexesReady) indexesReady = Promise.all([DiscordConnectionModel.createIndexes(), DiscordAuthorizationModel.createIndexes(), DiscordStateModel.createIndexes()]).catch((error) => { indexesReady = undefined; throw error; });
  return indexesReady;
}

export default class CampaignDiscordHandler {
  private async context(req: AuthenticatedRequest, writable = true) {
    const campaignId = objectId(req.params.campaignId);
    const player = await PlayerModel.findOne({ user: req.user._id } as any).lean();
    if (!player) throw new ErrorUtil('Player profile not found.', 403);
    const campaign = await CampaignModel.findById(campaignId).lean();
    if (!campaign) throw new ErrorUtil('Campaign not found.', 404);
    const member = campaign.members.find((entry) => String(entry.player) === String(player._id));
    if (String(campaign.owner) !== String(player._id) && !['sw', 'co-sw'].includes(member?.role ?? '')) throw new ErrorUtil('Only campaign Storyweavers can manage Discord connections.', 403);
    if (writable && campaign.status === 'archived') throw new ErrorUtil('Archived campaigns are read-only.', 403);
    return { campaign, binding: { campaign: campaign._id, player: player._id, user: req.user._id } };
  }

  private async authorization(binding: object) {
    const session = await DiscordAuthorizationModel.findOne({ ...binding, expiresAt: { $gt: new Date() } }).lean();
    if (!session) throw new ErrorUtil('Discord verification expired. Authorize again to edit this connection.', 401);
    return session;
  }

  private async access(binding: object, guildId: string) {
    const session = await this.authorization(binding);
    if (!session.guilds.some((guild) => guild.id === guildId)) throw new ErrorUtil('Authorize a Discord account that manages this server.', 403);
    return liveGuildAccess(guildId, session.discordUserId);
  }

  async get(req: AuthenticatedRequest) {
    const { binding, campaign } = await this.context(req, false);
    const [connection, session, latestRoll] = await Promise.all([
      DiscordConnectionModel.findOne({ campaign: binding.campaign }).select('guildId guildName mappings -_id').lean(),
      DiscordAuthorizationModel.findOne({ ...binding, expiresAt: { $gt: new Date() } }).lean(),
      RollLogModel.findOne({ campaign: binding.campaign, discordDelivery: { $exists: true } }).sort({ rolledAt: -1, _id: -1 }).select('+discordDelivery').lean(),
    ]);
    let ready = true;
    try { discordSettings(); } catch { ready = false; }
    const delivery = latestRoll?.discordDelivery;
    const rollsReady = discordBotReady() && discordRollWorkerRunning();
    return {
      connection, ready, verifiedUntil: session?.expiresAt ?? null, syncActive: false,
      rollsReady, rollsSyncActive: Boolean(rollsReady && connection?.mappings?.rolls && campaign.status !== 'archived'),
      lastRollDelivery: delivery && latestRoll ? { rollId: latestRoll._id.toString(), state: delivery.state, at: delivery.sentAt ?? delivery.finishedAt ?? delivery.createdAt, error: delivery.lastError || null } : null,
    };
  }

  async start(req: AuthenticatedRequest) {
    const { binding } = await this.context(req);
    const settings = discordSettings();
    await ensureIndexes();
    const state = randomBytes(32).toString('base64url');
    await DiscordStateModel.deleteMany(binding);
    await DiscordStateModel.create({ ...binding, digest: digest(state), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    const params = new URLSearchParams({ client_id: settings.applicationId, redirect_uri: settings.redirectUri, response_type: 'code', scope: 'identify guilds', state, prompt: 'consent' });
    return { url: `https://discord.com/oauth2/authorize?${params}` };
  }

  async complete(req: AuthenticatedRequest) {
    const { binding } = await this.context(req);
    const { state, code, iss } = req.body ?? {};
    if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state) || typeof code !== 'string' || !code || code.length > 2048) throw new ErrorUtil('Discord authorization response is invalid. Start again from campaign settings.', 400);
    if (iss !== undefined && iss !== 'https://discord.com') throw new ErrorUtil('Discord authorization issuer is invalid.', 400);
    const settings = discordSettings();
    await ensureIndexes();
    // Atomic single-use claim binds the callback to this authenticated user, player and campaign.
    const claimed = await DiscordStateModel.findOneAndDelete({ ...binding, digest: digest(state), expiresAt: { $gt: new Date() } });
    if (!claimed) throw new ErrorUtil('Discord authorization expired or was already used. Start again from campaign settings.', 400);
    let token: string | undefined;
    try {
      const result = await discordRequest<{ access_token: string; scope: string }>('/oauth2/token', null, new URLSearchParams({ client_id: settings.applicationId, client_secret: settings.clientSecret, grant_type: 'authorization_code', code, redirect_uri: settings.redirectUri }));
      token = result.access_token;
      if (!token || !['identify', 'guilds'].every((scope) => result.scope?.split(' ').includes(scope))) throw new ErrorUtil('Discord did not grant the required permissions. Authorize again.', 403);
      const user = await discordRequest<{ id: string }>('/users/@me', `Bearer ${token}`);
      const guilds = await discordRequest<DiscordGuild[]>('/users/@me/guilds?limit=200', `Bearer ${token}`);
      // Only inspect bot membership for guilds this account is allowed to manage.
      const candidates: { id: string; name: string }[] = [];
      for (const guild of guilds.filter(mayManage)) {
        try {
          const live = await discordRequest<DiscordGuild>(`/guilds/${snowflake(guild.id)}`, `Bot ${settings.botToken}`);
          candidates.push({ id: live.id, name: live.name });
        } catch (error) {
          if (!(error instanceof ErrorUtil) || error.statusCode !== 403) throw error;
        }
      }
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await DiscordAuthorizationModel.findOneAndUpdate(binding, { $set: { ...binding, discordUserId: snowflake(user.id), guilds: candidates, expiresAt } }, { upsert: true });
      return { verifiedUntil: expiresAt };
    } finally {
      // User tokens are never persisted or returned to the browser.
      if (token) await discordRequest('/oauth2/token/revoke', null, new URLSearchParams({ client_id: settings.applicationId, client_secret: settings.clientSecret, token, token_type_hint: 'access_token' })).catch(() => undefined);
    }
  }

  async guilds(req: AuthenticatedRequest) {
    const { binding } = await this.context(req);
    const session = await this.authorization(binding);
    const guilds: { id: string; name: string }[] = [];
    for (const candidate of session.guilds) {
      try {
        const { guild } = await liveGuildAccess(candidate.id!, session.discordUserId);
        guilds.push({ id: guild.id, name: guild.name });
      } catch (error) {
        if (!(error instanceof ErrorUtil) || error.statusCode !== 403) throw error;
      }
    }
    return guilds;
  }

  async channels(req: AuthenticatedRequest) {
    const { binding } = await this.context(req);
    return liveChannels(await this.access(binding, snowflake(req.params.guildId)));
  }

  async save(req: AuthenticatedRequest) {
    const { binding } = await this.context(req);
    const guildId = snowflake(req.body?.guildId);
    const input = req.body?.mappings;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['ic', 'ooc', 'rolls'].includes(key))) throw new ErrorUtil('Invalid Discord mappings.', 400);
    const access = await this.access(binding, guildId);
    const channels = await liveChannels(access);
    const mappings: Record<'ic' | 'ooc' | 'rolls', Mapping | null> = { ic: null, ooc: null, rolls: null };
    const destinationIds: string[] = [];
    for (const purpose of ['ic', 'ooc', 'rolls'] as const) {
      if (input[purpose] == null) continue;
      const discordChannelId = snowflake(input[purpose].discordChannelId);
      const channel = channels.find((entry) => entry.id === discordChannelId);
      if (!channel?.available) throw new ErrorUtil(channel?.reason ?? 'Choose an available text channel in this server.', 400);
      if (destinationIds.includes(discordChannelId)) throw new ErrorUtil('Each purpose needs a different Discord channel.', 400);
      destinationIds.push(discordChannelId);
      const mapping: Mapping = { discordChannelId, discordChannelName: channel.name };
      if (purpose !== 'rolls') {
        const chatChannelId = objectId(input[purpose].chatChannelId);
        const chat = await ChatChannelModel.findOne({ _id: chatChannelId, campaign: binding.campaign, mode: purpose, visibility: 'campaign', archived: false }).lean();
        if (!chat) throw new ErrorUtil('Choose an active campaign-wide chat channel of the matching kind.', 400);
        mapping.chatChannelId = chatChannelId;
        mapping.chatChannelName = chat.name;
      }
      mappings[purpose] = mapping;
    }
    await ensureIndexes();
    // Recheck campaign access after upstream requests; write one atomic configuration document.
    await this.context(req);
    try {
      await DiscordConnectionModel.findOneAndUpdate({ campaign: binding.campaign }, {
        $set: { guildId, guildName: access.guild.name, mappings, ...(destinationIds.length ? { destinationIds } : {}) },
        ...(!destinationIds.length ? { $unset: { destinationIds: 1 } } : {}),
      }, { upsert: true, runValidators: true });
    } catch (error) {
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw new ErrorUtil('A Discord channel is already mapped to another campaign. Choose a different channel and save again.', 409);
      throw error;
    }
    return this.get(req);
  }

  async disconnect(req: AuthenticatedRequest) {
    const { binding } = await this.context(req);
    await DiscordConnectionModel.deleteOne({ campaign: binding.campaign });
    await DiscordAuthorizationModel.deleteMany({ campaign: binding.campaign });
    await DiscordStateModel.deleteMany({ campaign: binding.campaign });
    return this.get(req);
  }
}

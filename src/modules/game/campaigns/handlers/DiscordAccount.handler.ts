import { createHash, randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { DiscordAccountModel, DiscordAccountStateModel } from '../model/DiscordAccountModel';
import { discordRequest, discordSettings } from '../utils/discordClient';

const digest = (state: string) => createHash('sha256').update(state).digest('hex');
let indexesReady: Promise<unknown> | undefined;
function ensureIndexes() {
  if (!indexesReady) indexesReady = Promise.all([DiscordAccountModel.createIndexes(), DiscordAccountStateModel.createIndexes()]).catch((error) => { indexesReady = undefined; throw error; });
  return indexesReady;
}

export default class DiscordAccountHandler {
  private async context(req: AuthenticatedRequest, writable = false) {
    if (!/^[a-f\d]{24}$/i.test(req.params.campaignId ?? '')) throw new ErrorUtil('Invalid campaign ID.', 400);
    const player = await PlayerModel.findOne({ user: req.user._id } as any).lean();
    if (!player) throw new ErrorUtil('Player profile not found.', 403);
    const campaign = await CampaignModel.findById(req.params.campaignId).lean();
    if (!campaign) throw new ErrorUtil('Campaign not found.', 404);
    const member = campaign.members.find((entry) => String(entry.player) === String(player._id));
    const owner = String(campaign.owner) === String(player._id);
    if (!owner && !member) throw new ErrorUtil('Not a campaign member.', 403);
    if (writable && campaign.status === 'archived') throw new ErrorUtil('Archived campaigns are read-only.', 403);
    return { campaign, canManage: owner || ['sw', 'co-sw'].includes(member?.role ?? ''), binding: { campaign: campaign._id, player: player._id, user: req.user._id, purpose: 'account' } };
  }

  async get(req: AuthenticatedRequest) {
    const { campaign, binding, canManage } = await this.context(req);
    const linked = Boolean(await DiscordAccountModel.exists({ player: binding.player }));
    let ready = true;
    try { discordSettings(); } catch { ready = false; }
    return { requirement: campaign.discordRequirement ?? 'optional', linked, ready, canManage, readOnly: campaign.status === 'archived' };
  }

  async requirement(req: AuthenticatedRequest) {
    const { campaign, canManage } = await this.context(req, true);
    if (!canManage) throw new ErrorUtil('Only campaign Storyweavers can change the Discord requirement.', 403);
    const requirement = req.body?.requirement;
    if (!['optional', 'required'].includes(requirement)) throw new ErrorUtil('Choose optional or required Discord account linking.', 400);
    const result = await CampaignModel.updateOne({ _id: campaign._id, status: { $ne: 'archived' } }, { $set: { discordRequirement: requirement } });
    if (!result.matchedCount) throw new ErrorUtil('Archived campaigns are read-only.', 403);
    return this.get(req);
  }

  async start(req: AuthenticatedRequest) {
    const { binding } = await this.context(req, true);
    const settings = discordSettings();
    await ensureIndexes();
    const state = randomBytes(32).toString('base64url');
    await DiscordAccountStateModel.deleteMany(binding);
    await DiscordAccountStateModel.create({ ...binding, digest: digest(state), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    const params = new URLSearchParams({ client_id: settings.applicationId, redirect_uri: settings.redirectUri, response_type: 'code', scope: 'identify', state, prompt: 'consent' });
    return { url: `https://discord.com/oauth2/authorize?${params}`, purpose: 'account' as const };
  }

  async complete(req: AuthenticatedRequest) {
    const { binding } = await this.context(req, true);
    const { state, code, iss } = req.body ?? {};
    if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state) || typeof code !== 'string' || !code || code.length > 2048) throw new ErrorUtil('Discord authorization response is invalid. Start linking again.', 400);
    if (iss !== undefined && iss !== 'https://discord.com') throw new ErrorUtil('Discord authorization issuer is invalid.', 400);
    const settings = discordSettings();
    await ensureIndexes();
    const claimed = await DiscordAccountStateModel.findOneAndDelete({ ...binding, digest: digest(state), expiresAt: { $gt: new Date() } });
    if (!claimed) throw new ErrorUtil('Discord authorization expired or was already used. Start linking again.', 400);
    let token: string | undefined;
    try {
      const result = await discordRequest<{ access_token: string; scope: string }>('/oauth2/token', null, new URLSearchParams({ client_id: settings.applicationId, client_secret: settings.clientSecret, grant_type: 'authorization_code', code, redirect_uri: settings.redirectUri }));
      token = result.access_token;
      if (!token || !result.scope?.split(' ').includes('identify')) throw new ErrorUtil('Discord did not grant identity verification. Start linking again.', 403);
      const identity = await discordRequest<{ id: string }>('/users/@me', `Bearer ${token}`);
      if (typeof identity.id !== 'string' || !/^\d{17,20}$/.test(identity.id)) throw new ErrorUtil('Discord returned an invalid identity.', 502);
      // Recheck membership and archive state after the external authorization exchange.
      await this.context(req, true);
      try {
        // Both keys are unique. A different existing link must first be unlinked;
        // simultaneous claims cannot move another player's verified identity.
        await DiscordAccountModel.findOneAndUpdate({ player: binding.player, discordUserId: identity.id }, { $set: { verifiedAt: new Date() } }, { upsert: true, runValidators: true });
      } catch (error: any) {
        if (error?.code === 11000) throw new ErrorUtil('This player or Discord account already has a different link. Unlink the existing account before trying again.', 409);
        throw error;
      }
      return this.get(req);
    } finally {
      if (token) await discordRequest('/oauth2/token/revoke', null, new URLSearchParams({ client_id: settings.applicationId, client_secret: settings.clientSecret, token, token_type_hint: 'access_token' })).catch(() => undefined);
    }
  }

  async unlink(req: AuthenticatedRequest) {
    const { binding } = await this.context(req, true);
    await DiscordAccountStateModel.deleteMany({ player: binding.player });
    await DiscordAccountModel.deleteOne({ player: binding.player });
    return this.get(req);
  }
}

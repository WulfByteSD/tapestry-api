import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { DiscordConnectionModel } from '../model/DiscordIntegrationModel';

export default class CampaignPlaySurfaceHandler {
  private async context(req: AuthenticatedRequest) {
    const campaignId = req.params.campaignId;
    if (!/^[a-f\d]{24}$/i.test(campaignId)) throw new ErrorUtil('Invalid campaign ID.', 400);
    const player = await PlayerModel.findOne({ user: req.user._id } as any).lean();
    if (!player) throw new ErrorUtil('Player profile not found.', 403);
    const campaign = await CampaignModel.findById(campaignId).lean();
    if (!campaign) throw new ErrorUtil('Campaign not found.', 404);
    const owner = String(campaign.owner) === String(player._id);
    const member = campaign.members.find((entry) => String(entry.player) === String(player._id));
    if (!owner && !member) throw new ErrorUtil('Only campaign members can view the play surface.', 403);
    const canManage = owner || ['sw', 'co-sw'].includes(member?.role ?? '');
    // The server landing page avoids revealing private channel destinations.
    const connection = await DiscordConnectionModel.findOne({ campaign: campaign._id }).select('guildId -_id').lean();
    const discordUrl = connection && /^\d{17,20}$/.test(connection.guildId) ? `https://discord.com/channels/${connection.guildId}` : null;
    return { campaign, canManage, discordUrl };
  }

  async get(req: AuthenticatedRequest) {
    const { campaign, canManage, discordUrl } = await this.context(req);
    return { playSurface: campaign.playSurface ?? 'tapestry', discordUrl, canManage, readOnly: campaign.status === 'archived' };
  }

  async save(req: AuthenticatedRequest) {
    const { campaign, canManage, discordUrl } = await this.context(req);
    if (!canManage) throw new ErrorUtil('Only campaign Storyweavers can change the play surface.', 403);
    if (campaign.status === 'archived') throw new ErrorUtil('Archived campaigns are read-only.', 403);
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['tapestry', 'discord'].includes(body.playSurface)) {
      throw new ErrorUtil('Choose tapestry or discord as the play surface.', 400);
    }
    if (body.playSurface === 'discord' && !discordUrl) throw new ErrorUtil('Save a Discord server connection before choosing Discord.', 400);
    const updated = await CampaignModel.findOneAndUpdate({ _id: campaign._id, status: { $ne: 'archived' } }, { $set: { playSurface: body.playSurface } }, { returnDocument: 'after', runValidators: true });
    if (!updated) throw new ErrorUtil('The campaign is no longer editable.', 403);
    return { playSurface: updated.playSurface ?? 'tapestry', discordUrl, canManage, readOnly: false };
  }
}

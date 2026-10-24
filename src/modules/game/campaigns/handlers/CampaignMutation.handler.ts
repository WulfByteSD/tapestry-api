import Player from '../../../profiles/player/model/PlayerModel';
import Campaign from '../model/CampaignModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';

/** Authorization for generic mutations that can change membership or campaign availability. */
export default class CampaignMutationHandler {
  async authorize(userId: string | undefined, campaignId: string) {
    if (!userId) throw new ErrorUtil('Authentication required', 401);
    const player = await Player.findOne({ user: userId as any }).lean();
    const campaign = await Campaign.findById(campaignId).lean();
    const member = campaign?.members.find(entry => String(entry.player) === String(player?._id));
    if (!player || !campaign || (String(campaign.owner) !== String(player._id) && !['sw', 'co-sw'].includes(member?.role || '')))
      throw new ErrorUtil('Only campaign Storyweavers may change this campaign', 403);
  }
}

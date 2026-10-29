import PlayerModel from '../../../profiles/player/model/PlayerModel';
import CampaignModel from '../../campaigns/model/CampaignModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { objectId, parse } from './contracts';

export async function playerProfile(userId: unknown) {
  if (!userId) throw new ErrorUtil('A player account is required.', 403);
  const player = await PlayerModel.findOne({ user: userId } as any).select('_id').lean();
  if (!player) throw new ErrorUtil('Player profile not found.', 403);
  return String(player._id);
}
export async function campaignAccess(playerId: string, campaignId: string, write = false) {
  parse(objectId, campaignId);
  const campaign = await CampaignModel.findById(campaignId).select('owner members status').lean();
  if (!campaign) throw new ErrorUtil('Campaign not found.', 404);
  const member = campaign.members.find(entry => String(entry.player) === playerId);
  if (String(campaign.owner) !== playerId && !['sw', 'co-sw'].includes(member?.role ?? '')) throw new ErrorUtil('Only campaign Storyweavers can access encounter preparation.', 403);
  if (write && campaign.status === 'archived') throw new ErrorUtil('Archived campaigns are read-only.', 403);
  return campaign;
}

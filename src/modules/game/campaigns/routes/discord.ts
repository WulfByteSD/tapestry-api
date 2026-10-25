import express from 'express';
import CampaignDiscordService from '../service/CampaignDiscord.service';

const router = express.Router({ mergeParams: true });
const service = new CampaignDiscordService();
router.route('/account').get(service.account).delete(service.unlink);
router.post('/account/authorization', service.accountStart);
router.post('/account/authorization/complete', service.accountComplete);
router.put('/requirement', service.requirement);
router.route('/').get(service.get).put(service.save).delete(service.disconnect);
router.post('/authorization', service.start);
router.post('/authorization/complete', service.complete);
router.get('/guilds', service.guilds);
router.get('/guilds/:guildId/channels', service.channels);
export default router;

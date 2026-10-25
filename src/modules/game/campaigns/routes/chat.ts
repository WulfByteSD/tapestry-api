import express from 'express';
import CampaignChatService from '../chat/CampaignChatService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';

const router = express.Router({ mergeParams: true });
const service = new CampaignChatService();

router.use(AuthMiddleware.protect);
router.post('/setup', service.setup);
router.route('/channels').get(service.listChannels).post(service.createChannel);
router.patch('/channels/:channelId', service.updateChannel);
router.get('/channels/:channelId/messages', service.listMessages);
router.post('/channels/:channelId/messages', service.sendMessage);
router.put('/channels/:channelId/read', service.markRead);
router.patch('/messages/:messageId', service.updateMessage);
router.delete('/messages/:messageId', service.deleteMessage);

export default router;

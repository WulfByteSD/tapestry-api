import express from 'express';
import AdventureCampaignService from '../services/AdventureCampaign.service';
import AdventureAttachmentService from '../services/AdventureAttachment.service';

const router = express.Router();
const service = new AdventureCampaignService();
const attachments = new AdventureAttachmentService();
router.get('/:campaignId/resources', service.list);
router.route('/:campaignId/:id/resources/:resourceId').get(service.read).put(service.share).delete(service.unshare);
router.get('/:campaignId/:id/resources/:resourceId/asset', attachments.campaignRead);
export default router;

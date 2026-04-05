import express from 'express';
import CampaignActivityService from '../service/CampaignActivityService';

const router = express.Router({ mergeParams: true });
const service = new CampaignActivityService();

router.route('/').get(service.getFeed).post(service.postNote);

export default router;

import express from 'express';
import CampaignService from '../service/CampaignService';
import JoinRequestService from '../service/JoinRequestService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import asyncHandler from '../../../../middleware/asyncHandler';
import CampaignMetaService from '../service/CampaignMeta.service';

const router = express.Router({ mergeParams: true });

const service = new CampaignMetaService();

router.use(AuthMiddleware.protect);
router.route('/members/:playerId/role').patch(service.roleChange);

export default router;

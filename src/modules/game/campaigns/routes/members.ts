import express from 'express';
import CampaignService from '../service/CampaignService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';

const router = express.Router({ mergeParams: true });
const service = new CampaignService();

// All routes require authentication
router.use(AuthMiddleware.protect);

// Member management routes
router.route('/').post(service.addMember);

router.route('/:playerId').delete(service.removeMember);

export default router;

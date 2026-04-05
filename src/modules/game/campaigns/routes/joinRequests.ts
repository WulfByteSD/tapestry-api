import express from 'express';
import JoinRequestService from '../service/JoinRequestService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';

const router = express.Router({ mergeParams: true });
const service = new JoinRequestService();

// All routes require authentication
router.use(AuthMiddleware.protect);

// Direct join for open campaigns (on the campaign)
router.route('/join').post(service.joinCampaign);

// Join request management (on the campaign)
router.route('/').post(service.createJoinRequest).get(service.listPendingRequests);

router.route('/:requestId/approve').post(service.approveRequest);

router.route('/:requestId/deny').post(service.denyRequest); 

export default router;

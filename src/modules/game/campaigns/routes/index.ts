import express from 'express';
import CampaignService from '../service/CampaignService';
import JoinRequestService from '../service/JoinRequestService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import asyncHandler from '../../../../middleware/asyncHandler';

const router = express.Router();

const service = new CampaignService();
const joinRequestService = new JoinRequestService();

router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Campaign service is up and running',
    success: true,
  });
});

// All campaign routes require authentication
router.use(AuthMiddleware.protect);

// Join request routes - specific routes before parametric ones
router.route('/join-requests/me').get(joinRequestService.getMyRequests);

// Standard CRUD operations
router.route('/').post(service.create).get(service.getResources);

router.route('/mine').get(service.playerCampaigns);
router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);

// specific routes for campaigns
// router.route("/plublic").get(service.getPublicCampaigns);

// Direct join for open campaigns
router.route('/:id/join').post(joinRequestService.joinCampaign);

// Join request management for campaigns
router.route('/:id/join-requests').post(joinRequestService.createJoinRequest).get(joinRequestService.listPendingRequests);

router.route('/:id/join-requests/:requestId/approve').post(joinRequestService.approveRequest);

router.route('/:id/join-requests/:requestId/deny').post(joinRequestService.denyRequest);

// for players to see their join requests across campaigns
router.route('/join-requests/me').get(joinRequestService.getMyRequests);

// Member management in campaigns
router.route('/:id/members').post(service.addMember);

router.route('/:id/members/:playerId').delete(service.removeMember);

export default router;

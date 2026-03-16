import express from 'express';
import CampaignService from '../service/CampaignService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import asyncHandler from '../../../../middleware/asyncHandler';

const router = express.Router();

const service = new CampaignService();

router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Campaign service is up and running',
    success: true,
  });
});

// All campaign routes require authentication
router.use(AuthMiddleware.protect);

// Standard CRUD operations
router.route('/').post(service.create).get(service.getResources);

router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);


// specific routes for campaigns
// router.route("/plublic").get(service.getPublicCampaigns);


// Member management in campaigns
router.route('/:id/members').post(service.addMember);

router.route('/:id/members/:playerId').delete(service.removeMember);

export default router;

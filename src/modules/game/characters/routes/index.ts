import express from 'express';
import CharacterService from '../service/CharacterService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import asyncHandler from '../../../../middleware/asyncHandler';

const router = express.Router();

const service = new CharacterService();

router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Character service is up and running',
    success: true,
  });
});

// All character routes require authentication
router.use(AuthMiddleware.protect);

// Standard CRUD operations
router.route('/').post(service.create).get(service.getResources);

router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);

// Campaign operations
router.route('/:id/join-campaign').post(service.joinCampaign);
router.route('/:id/leave-campaign').post(service.leaveCampaign);
router.route('/:id/apply-harm').post(service.applyHarm);

// Character forking
router.route('/:id/fork').post(service.forkCharacter);

export default router;

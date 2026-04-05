import express from 'express';
import CampaignService from '../service/CampaignService';
import JoinRequestService from '../service/JoinRequestService';
import CharacterRequestService from '../service/CharacterRequestService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import metaRoutes from './meta';
import joinRequestRoutes from './joinRequests';
import memberRoutes from './members';
import characterRequestRoutes from './characterRequests';
import campaignCharacterRoutes from './campaignCharacters';
import activityRoutes from './activity';

const router = express.Router();

const service = new CampaignService();
const joinRequestService = new JoinRequestService();
const characterRequestService = new CharacterRequestService();

router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Campaign service is up and running',
    success: true,
  });
});

// All campaign routes require authentication
router.use(AuthMiddleware.protect);

// Player-specific collection routes (must come before /:id param routes)
router.route('/join-requests/me').get(joinRequestService.getMyRequests);
router.route('/character-requests/me').get(characterRequestService.getMyRequests);
router.route('/mine').get(service.playerCampaigns);

// Standard CRUD operations
router.route('/').post(service.create).get(service.getResources);

router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);

// Nested route handlers
router.use('/:id/meta', metaRoutes);
router.use('/:id/join-requests', joinRequestRoutes);
router.use('/:id/members', memberRoutes);
router.use('/:id/character-requests', characterRequestRoutes);
router.use('/:id/characters', campaignCharacterRoutes);
router.use('/:id/activity', activityRoutes);

// Direct join route (not nested under /join-requests)
router.route('/:id/join').post(joinRequestService.joinCampaign);

export default router;

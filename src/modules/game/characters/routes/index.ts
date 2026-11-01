import express from 'express';
import CharacterService from '../service/CharacterService';
import CharacterProgressionService from '../service/CharacterProgression.service';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import { getPublicCharacter } from '../handlers/PublicCharacter.handler';

const router = express.Router();

const service = new CharacterService();
const progression = new CharacterProgressionService();

router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Character service is up and running',
    success: true,
  });
});

// Anonymous access is limited to the explicit public card response.
router.get('/:id/public', getPublicCharacter);

// All other character routes require authentication
router.use(AuthMiddleware.protect);
router.get('/:id/progression', progression.progression);
router.post('/:id/progression/reset', progression.reset);
router.post('/:id/advance', progression.advance);
router.post('/:id/weave-awards/:awardId/resolve', progression.resolve);

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

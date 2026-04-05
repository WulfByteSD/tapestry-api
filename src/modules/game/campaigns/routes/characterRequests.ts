import express from 'express';
import CharacterRequestService from '../service/CharacterRequestService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';

const router = express.Router({ mergeParams: true });
const service = new CharacterRequestService();

router.use(AuthMiddleware.protect);

// List / create requests for a campaign
router.route('/').get(service.listRequests).post(service.createCharacterRequest);
router.route('/me').get(service.getMyRequests);

// Approve / reject a specific request
router.route('/:reqId/approve').post(service.approveRequest);
router.route('/:reqId/reject').post(service.rejectRequest);

export default router;

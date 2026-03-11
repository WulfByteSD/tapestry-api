import express from 'express';
import { PushSubscriptionService } from '../services/PushSubscription.service';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';

const router = express.Router();
const service = new PushSubscriptionService();

router.use(AuthMiddleware.protect);

router.route('/').get(service.listMine).post(service.upsertMine).delete(service.removeMine);
router.post('/test', service.sendTestToMe);

export default router;

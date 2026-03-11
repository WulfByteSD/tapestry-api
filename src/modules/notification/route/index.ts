// modules/notification/routes/index.ts
import express from 'express';
import { NCRUDService } from '../services/NCRUDService';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';
import pushRouter from './push';
const router = express.Router();

const service = new NCRUDService();

// Example diagnostic route
router.get('/health', (req, res) => {
  res.json({ status: 'notification module online' });
});
router.use('/subscriptions', pushRouter);


router.use(AuthMiddleware.protect);
router.route('/').get(service.getResources).post(service.create);
router.route('/:id').post(service.updateResource);
router.route('/update/all').post(service.updateAll);

router.use(AuthMiddleware.authorizeRoles(['admin', 'developer']) as any);
router.route('/').post(service.create);
router.route('/:id').delete(service.removeResource);
router.route('/alert').post(service.sendAlert);

export default router;

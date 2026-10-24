import express from 'express';
import ResourceService from '../services/Resource.service';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';

const router = express.Router();
const service = new ResourceService();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Content service is up and running',
  });
});

// Explicit admin reads must precede the public /:id route.
router.route('/admin').get(AuthMiddleware.protect as any, AuthMiddleware.authorizeRoles(['admin']) as any, service.getResources);
router.route('/admin/:id').get(AuthMiddleware.protect as any, AuthMiddleware.authorizeRoles(['admin']) as any, service.getResource);

router.route('/mine').get(AuthMiddleware.protect as any, service.getMyResources);
router.route('/:id/stream').get(service.streamPublicResource);
router.route('/:id/consume').get(AuthMiddleware.protect as any, service.consumeResource);
router.route('/').get(service.getPublicResources);
router.route('/:id').get(service.getPublicResource); 

router.use(AuthMiddleware.protect as any, AuthMiddleware.authorizeRoles(['admin']) as any);
router.route('/').get(service.getResources).post(service.create);
router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);

export default router;

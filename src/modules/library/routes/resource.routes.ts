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

// Standard CRUD operations

router.route('/').get(service.getResources);
router.route('/:id/view').get(service.viewResource);

router.use(AuthMiddleware.protect, AuthMiddleware.authorizeRoles(['admin']) as any);
router.route('/').post(service.create);
router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);

export default router;

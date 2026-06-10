import express from 'express';
import RAGService from '../services/Rag.service';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';

const router = express.Router();
const service = new RAGService();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Content service is up and running',
  });
});

router.use(AuthMiddleware.protect, AuthMiddleware.authorizeRoles(['admin']) as any);
// Standard CRUD operations
router.route('/').get(service.getResources);
router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);

export default router;

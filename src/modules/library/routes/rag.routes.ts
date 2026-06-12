import express from 'express';
import RAGService from '../services/Rag.service';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';

const router = express.Router();
const service = new RAGService();

router.use(AuthMiddleware.protect as any, AuthMiddleware.authorizeRoles(['admin']) as any);
router.route('/:id').get(service.getResource).delete(service.removeResource);

export default router;

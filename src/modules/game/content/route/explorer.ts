import { Router } from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import ExplorerService from '../service/Explorer.service';

const router = Router();
const service = new ExplorerService();
router.use(AuthMiddleware.protect);
router.get('/', service.list);
router.get('/filters', service.filters);
router.get('/:type/:id', service.detail);
export default router;

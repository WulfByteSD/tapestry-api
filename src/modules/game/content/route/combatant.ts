import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import CombatantService from '../service/CombatantService';

const router = express.Router();
const service = new CombatantService();

router.use(AuthMiddleware.protect);

router.get('/', service.getResources);
router.get('/:id', service.getResource);

router.use(AuthMiddleware.authorizeRoles(['admin']) as any);
router.route('/:id').put(service.updateResource).delete(service.removeResource);

router.post('/', service.create);

export default router;

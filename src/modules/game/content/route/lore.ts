import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import LoreService from '../service/Lore.service';

const router = express.Router();
const service = new LoreService();

router.use(AuthMiddleware.protect);
// route/lore.ts
router.get('/', service.getResources);
router.get('/tree/:settingKey', service.getTreeForSetting);
router.get('/children/:parentId', service.getChildrenForNode);
router.get('/context/:id', service.getFocusedContext);
router.get('/by-key/:settingKey/:key', service.getBySettingAndKey);
router.get('/:id', service.getResource);

router.post('/', service.create);
router.put('/:id', service.updateResource);
router.delete('/:id', service.removeResource);

export default router;

import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import { requireContentAdmin } from '../util/contentReader';
import LoreService from '../service/Lore.service';

import { legacyContentReader } from '../service/ContentReader.service';
const router = express.Router();
const service = new LoreService();

router.use(AuthMiddleware.protect);
router.use(legacyContentReader('lore'));
// route/lore.ts
router.get('/', service.getResources);
router.get('/tree/:settingKey', service.getTreeForSetting);
router.get('/children/:parentId', service.getChildrenForNode);
router.get('/context/:id', service.getFocusedContext);
router.get('/by-key/:settingKey/:key', service.getBySettingAndKey);
router.get('/:id', service.getResource);

router.use(requireContentAdmin);
router.post('/', service.create);
router.put('/:id', service.updateResource);
router.delete('/:id', service.removeResource);

export default router;

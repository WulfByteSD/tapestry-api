import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import AbilitiesService from '../service/AbilityDefinition.service';

const router = express.Router();
const service = new AbilitiesService();

router.use(AuthMiddleware.protect);

router.get('/by-key/:key', service.getAbilityByKey);
router.get('/setting/:settingKey', service.getAbilitiesForSetting);

router.get('/', service.getResources);
router.get('/:id', service.getResource);

router.post('/', service.create);
router.put('/:id', service.updateResource);
router.delete('/:id', service.removeResource);

export default router;

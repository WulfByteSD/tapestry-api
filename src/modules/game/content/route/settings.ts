import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import SettingsService from '../service/SettingsService';

const router = express.Router();
const service = new SettingsService();

router.use(AuthMiddleware.protect);

// specialized reads
router.get('/by-key/:key', service.getSettingByKey);

// generic CRUD reads
router.get('/', service.getResources);
router.get('/:id', service.getResource);

// intentionally not exposed yet
// router.post("/", service.create);
// router.put("/:id", service.updateResource);
// router.delete("/:id", service.removeResource);

export default router;

import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import SkillsService from '../service/SkillDefinition.service';

const router = express.Router();
const service = new SkillsService();

router.use(AuthMiddleware.protect);

// specialized reads
router.get('/by-key/:key', service.getSkillByKey);
router.get('/setting/:settingKey', service.getSkillsForSetting);

// generic CRUD reads
router.get('/', service.getResources);
router.get('/:id', service.getResource);

// admin CRUD
router.post('/', service.create);
router.put('/:id', service.updateResource);
router.delete('/:id', service.removeResource);

// If you want stricter admin control later, swap the CRUD lines above for:
// router.post("/", AuthMiddleware.authorizeRoles(["content:write"]), service.create);
// router.put("/:id", AuthMiddleware.authorizeRoles(["content:write"]), service.updateResource);
// router.delete("/:id", AuthMiddleware.authorizeRoles(["content:delete"]), service.removeResource);

export default router;

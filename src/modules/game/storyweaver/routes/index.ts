import express from 'express';
import { StoryweaverService } from '../service/Storyweaver.service';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';

const router = express.Router();
const service = new StoryweaverService();

router.use(AuthMiddleware.protect);
router.post('/become', service.becomeStoryweaver);

export default router;

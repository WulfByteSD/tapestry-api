import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import LinkedContentService from '../service/LinkedContent.service';

const router = express.Router();
const service = new LinkedContentService();

router.use(AuthMiddleware.protect);

router.get('/search', service.searchLinkedOptions);

export default router;

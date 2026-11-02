import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import { requireContentAdmin } from '../util/contentReader';
import LinkedContentService from '../service/LinkedContent.service';

const router = express.Router();
const service = new LinkedContentService();

router.use(AuthMiddleware.protect, requireContentAdmin);

router.get('/search', service.searchLinkedOptions);

export default router;

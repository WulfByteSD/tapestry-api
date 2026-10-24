import express from 'express';
import AdventureAdminService from '../services/AdventureAdmin.service';
import AdventureAttachmentService from '../services/AdventureAttachment.service';

const router = express.Router();
const service = new AdventureAdminService();
const attachments = new AdventureAttachmentService();
router.use(service.authorize);
router.route('/').get(service.list).post(service.create);
router.route('/:id').get(service.read).put(service.update).delete(service.remove);
router.patch('/:id/status', service.changeStatus);
router.route('/:id/resources/:resourceId/asset')
  .post(attachments.parseBytes, attachments.upload).get(attachments.adminRead).delete(attachments.remove);
export default router;

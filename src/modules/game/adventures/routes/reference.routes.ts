import express from 'express';
import AdventureReferenceService from '../services/AdventureReference.service';
import AdventureAttachmentService from '../services/AdventureAttachment.service';

const router = express.Router();
const service = new AdventureReferenceService();
const attachments = new AdventureAttachmentService();
router.get('/', service.list);
router.get('/:id', service.read);
router.get('/:id/sections/:sectionId', service.section);
router.get('/:id/resources', service.resources);
router.get('/:id/resources/:resourceId', service.material);
router.get('/:id/resources/:resourceId/asset', attachments.ownerRead);
export default router;

import express from 'express';
import CharacterRequestService from '../service/CharacterRequestService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';

const router = express.Router({ mergeParams: true });
const service = new CharacterRequestService();

router.use(AuthMiddleware.protect);

// List all approved characters in the campaign / SW direct-attach
router.route('/').get(service.listCampaignCharacters).post(service.directAttachCharacter);

// Detach a character from the campaign
router.route('/:charId').delete(service.detachCharacter);

export default router;

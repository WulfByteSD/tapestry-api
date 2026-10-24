import express from 'express';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import AdventureReferenceService from '../services/AdventureReference.service';
import adminRoutes from './admin.routes';
import campaignResources from './campaignResources.routes';
import referenceRoutes from './reference.routes';

export function createAdventureRoutes() {
  const router = express.Router();
  const service = new AdventureReferenceService();
  router.use(AuthMiddleware.protect as any, service.privateResponses);
  router.use('/admin', adminRoutes);
  router.use('/campaigns', campaignResources);
  router.use('/', referenceRoutes);
  return router;
}
export default createAdventureRoutes();

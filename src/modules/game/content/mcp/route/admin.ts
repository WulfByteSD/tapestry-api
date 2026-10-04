import express from 'express';
import { McpAuthMiddleware } from '../middleware/McpAuth.middleware';
import { McpAdminService } from '../service/McpAdmin.service';

/** Human-only management/review routes. Agent OAuth credentials are never accepted here. */
export function createAdminRoutes(auth: McpAuthMiddleware, service: McpAdminService) {
  const router = express.Router();
  router.use(auth.human);
  const manage = McpAuthMiddleware.authorize('manage');
  const review = McpAuthMiddleware.authorize('review');
  router.get('/clients', manage, service.list('clients'));
  router.post('/clients', manage, service.createClient);
  router.put('/clients/:clientId', manage, service.updateClient);
  router.post('/clients/:clientId/rotate-secret', manage, service.rotateSecret);
  router.get('/grants', manage, service.list('grants'));
  router.post('/grants', manage, service.createGrant);
  router.put('/grants/:id', manage, service.updateGrant);
  router.post('/grants/:id/revoke', manage, service.revokeGrant);
  router.get('/audit', manage, service.list('audit'));
  router.get('/proposals', review, service.list('proposals'));
  router.get('/proposals/:id', review, service.getProposal);
  router.post('/proposals/:id/approve', review, service.approve);
  router.post('/proposals/:id/reject', review, service.reject);
  return router;
}

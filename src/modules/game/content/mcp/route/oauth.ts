import express from 'express';
import { McpOAuthService } from '../service/McpOAuth.service';

/** OAuth is preregistration-only: intentionally no public client-registration or password-grant route. */
export function createOAuthRoutes(service: McpOAuthService) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false, limit: '64kb' }));
  router.get('/authorize', service.authorize);
  router.post('/authorize', service.consent);
  router.post('/token', service.token);
  router.post('/revoke', service.revoke);
  return router;
}

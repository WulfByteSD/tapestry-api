import express from 'express';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/express';
import { MCP_PATH, McpConfig, CAPABILITIES } from '../types/McpTypes';
import { readConfig } from '../util/mcpConfig';
import { mcpSecurity, mcpErrors } from '../middleware/McpSecurity.middleware';
import { McpAuthMiddleware } from '../middleware/McpAuth.middleware';
import { McpRateLimitHandler, LimitStore } from '../handlers/McpRateLimit.handler';
import { McpTokenHandler } from '../handlers/McpToken.handler';
import { McpOAuthHandler } from '../handlers/McpOAuth.handler';
import { ContentWriteHandler } from '../handlers/ContentWrite.handler';
import { McpAdminHandler } from '../handlers/McpAdmin.handler';
import { ContentMcpService } from '../service/ContentMcp.service';
import { McpOAuthService } from '../service/McpOAuth.service';
import { McpAdminService } from '../service/McpAdmin.service';
import { createOAuthRoutes } from './oauth';
import { createAdminRoutes } from './admin';

/**
 * Mount at the Express app root before generic JSON parsers, sanitizers, and wildcard CORS.
 * Domain endpoints remain under /api/v1/game/content/mcp; OAuth discovery uses root well-known paths.
 * Disabled configuration returns an empty router and exposes no MCP endpoints.
 */
export function createContentMcpRoutes(config: McpConfig | null = readConfig(), limitStore?: LimitStore) {
  const root = express.Router();
  if (!config) return root;
  const limits = new McpRateLimitHandler(limitStore);
  const writes = new ContentWriteHandler((actor) => limits.write(actor));
  const auth = new McpAuthMiddleware(new McpTokenHandler(config), limits);
  const security = mcpSecurity(config);
  const errors = mcpErrors(config);
  const metadata = new URL(getOAuthProtectedResourceMetadataUrl(new URL(config.resource))).pathname;
  root.get(metadata, security, (_req, res) =>
    res.json({ resource: config.resource, authorization_servers: [config.origin], scopes_supported: CAPABILITIES, bearer_methods_supported: ['header'] })
  );
  root.get('/.well-known/oauth-authorization-server', security, (_req, res) =>
    res.json({
      issuer: config.origin,
      authorization_endpoint: `${config.resource}/oauth/authorize`,
      token_endpoint: `${config.resource}/oauth/token`,
      revocation_endpoint: `${config.resource}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: CAPABILITIES,
    })
  );
  const router = express.Router();
  router.use(security);
  router.use('/oauth', createOAuthRoutes(new McpOAuthService(new McpOAuthHandler(config), limits, config)));
  router.use(express.json({ limit: '1mb' }));
  router.use('/admin', createAdminRoutes(auth, new McpAdminService(new McpAdminHandler(writes))));
  router.all('/', auth.agent, new ContentMcpService(writes).handle);
  // Own all paths under this namespace so they cannot fall through to legacy content routes or CORS.
  router.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  router.use(errors);
  root.use(MCP_PATH, router);
  return root;
}

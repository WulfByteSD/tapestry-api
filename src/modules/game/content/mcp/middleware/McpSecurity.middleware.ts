import { Request, Response, NextFunction } from 'express';
import OAuth2Server from '@node-oauth/oauth2-server';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/express';
import { McpConfig } from '../types/McpTypes';
import { failure } from '../util/McpError';
import { audit } from '../handlers/McpAudit.handler';

/** Exact host and origin allowlists protect the MCP surface without changing the rest of the API's CORS behavior. */
export function mcpSecurity(config: McpConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    const origin = req.get('origin');
    const denied = !config.hosts.includes((req.get('host') || '').toLowerCase()) ? 'Host' : origin && !config.origins.includes(origin) ? 'Origin' : undefined;
    if (denied) {
      try { await audit(undefined, 'transport_denied', { code: 'forbidden', target: denied }); }
      catch (error) { const e = failure(error); res.status(503).json({ error: 'unavailable', error_description: e.message }); return; }
      res.status(403).json({ error: 'forbidden', error_description: `${denied} is not allowed.` }); return;
    }
    if (origin) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,MCP-Protocol-Version,MCP-Session-Id,Mcp-Client-Info,Mcp-Client-Capabilities',
      'Access-Control-Expose-Headers': 'WWW-Authenticate,MCP-Protocol-Version' });
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  };
}

/** Return stable transport errors and standards-compliant bearer challenges, without secret-bearing stack traces. */
export function mcpErrors(config: McpConfig) {
  return (error: any, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) { res.end(); return; }
    const oauthError = error instanceof OAuth2Server.OAuthError;
    const e = failure(error);
    const status = error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : oauthError ? (error.code < 500 ? error.code : 503) : e.status;
    const code = error?.type === 'entity.too.large' ? 'request_too_large' : error instanceof SyntaxError ? 'validation' : oauthError && error.code < 500 ? error.name : e.code;
    const message = oauthError && error.code < 500 ? error.message : error?.type === 'entity.too.large' ? 'Request exceeds the configured body limit.' : error instanceof SyntaxError ? 'Malformed request body.' : e.message;
    if ([401, 403].includes(status) && req.path === '/') res.set('WWW-Authenticate', `Bearer resource_metadata="${getOAuthProtectedResourceMetadataUrl(new URL(config.resource))}", error="${status === 401 ? 'invalid_token' : 'insufficient_scope'}", scope="read"`);
    if (status === 401 && oauthError && req.get('authorization')?.startsWith('Basic ')) res.set('WWW-Authenticate', 'Basic realm="Tapestry MCP"');
    if (status === 429) res.set('Retry-After', '60');
    res.status(status).json({ error: code, error_description: message });
  };
}

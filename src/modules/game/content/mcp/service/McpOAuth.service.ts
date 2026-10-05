import { Request, Response, NextFunction } from 'express';
import OAuth2Server from '@node-oauth/oauth2-server';
import { z } from 'zod';
import { McpOAuthHandler } from '../handlers/McpOAuth.handler';
import { McpRateLimitHandler } from '../handlers/McpRateLimit.handler';
import { audit } from '../handlers/McpAudit.handler';
import { McpConfig, MCP_PATH } from '../types/McpTypes';
import { consentPage } from '../util/consentPage';
import { failure } from '../util/McpError';

/** Express controllers translate OAuth HTTP requests without mixing transport logic into persistence handlers. */
export class McpOAuthService {
  constructor(
    private handler: McpOAuthHandler,
    private limits: McpRateLimitHandler,
    private config: McpConfig
  ) {}

  /** Render consent only for a validated, preregistered callback; the Secure cookie binds the browser to its stored intent. */
  authorize = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.limits.consume('consent', req.ip || 'unknown', 10);
      const consent = await this.handler.beginConsent(req.query);
      res.cookie('tapestry_mcp_csrf', consent.csrf, { httpOnly: true, secure: true, sameSite: 'strict', path: `${MCP_PATH}/oauth`, maxAge: 300000 });
      res.set('Content-Security-Policy', `default-src 'none'; form-action 'self' ${consent.callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`);
      res.set('Referrer-Policy', 'strict-origin');
      res.type('html').send(consentPage(consent.name, consent.scopes, consent.intent, consent.csrf));
    } catch (error) {
      await this.denial(error, next);
    }
  };

  /** Process the human's sign-in and explicit consent; secrets are never put in the OAuth callback. */
  consent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.limits.consume('consent', req.ip || 'unknown', 10);
      const cookie =
        (req.headers.cookie || '')
          .split(';')
          .map((v) => v.trim())
          .find((v) => v.startsWith('tapestry_mcp_csrf='))
          ?.slice('tapestry_mcp_csrf='.length) || '';
      const location = await this.handler.finishConsent(req.body, cookie, req.get('origin'));
      res.clearCookie('tapestry_mcp_csrf', { secure: true, httpOnly: true, sameSite: 'strict', path: `${MCP_PATH}/oauth` });
      res.redirect(303, location);
    } catch (error) {
      await this.denial(error, next);
    }
  };

  /** Return the OAuth library's standard token response, with explicit no-store caching and per-IP limits. */
  token = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.limits.consume('token', req.ip || 'unknown', 30);
      // The OAuth library's type-is check also requires the real body framing headers.
      const headers = {
        'content-type': req.get('content-type') || '',
        authorization: req.get('authorization') || '',
        ...(req.get('content-length') ? { 'content-length': req.get('content-length')! } : {}),
        ...(req.get('transfer-encoding') ? { 'transfer-encoding': req.get('transfer-encoding')! } : {}),
      };
      const result = await this.handler.exchange(req.body, headers);
      res.set(result.headers).status(result.status).json(result.body);
    } catch (error) {
      await this.denial(error, next);
    }
  };

  /** Authenticate the client before revoking its own presented token family. */
  revoke = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.limits.consume('token', req.ip || 'unknown', 30);
      const body = z
        .strictObject({
          token: z.string().min(1).max(512),
          client_id: z.string().min(1).max(128),
          client_secret: z.string().max(512).optional(),
          token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
        })
        .parse(req.body);
      res.json(await this.handler.revoke(body.token, body.client_id, body.client_secret));
    } catch (error) {
      await this.denial(error, next);
    }
  };

  /** Audit only stable error codes, never raw OAuth requests, passwords, or secret-bearing exceptions. */
  private async denial(error: unknown, next: NextFunction) {
    try {
      await audit(undefined, 'oauth_denied', { code: error instanceof OAuth2Server.OAuthError ? error.name : failure(error).code });
      next(error);
    } catch (storageError) {
      next(storageError);
    }
  }
}

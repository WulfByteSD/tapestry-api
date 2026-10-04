import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import Auth from '../../../../auth/model/Auth';
import Admin from '../../../../profiles/admin/model/AdminModel';
import { McpTokenHandler } from '../handlers/McpToken.handler';
import { McpRateLimitHandler } from '../handlers/McpRateLimit.handler';
import { audit } from '../handlers/McpAudit.handler';
import { McpError, failure } from '../util/McpError';

export interface AdminIdentity { id: string; manage: boolean; review: boolean }
export interface McpAdminRequest extends Request { mcpAdmin?: AdminIdentity }

/** Keep agent credentials and human administration credentials on separate authentication paths. */
export class McpAuthMiddleware {
  constructor(private tokens: McpTokenHandler, private limits: McpRateLimitHandler) {}

  /** Verify only MCP-issued bearer tokens, then enforce the shared per-grant request limit. */
  agent = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await this.limits.consume('network', req.ip || req.socket.remoteAddress || 'unknown', 300);
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw new McpError('invalid_token', 'MCP bearer authorization is required.', 401);
      req.auth = await this.tokens.verifyAccessToken(header.slice(7));
      if (!req.auth.scopes.includes('read')) throw new McpError('forbidden', 'Read capability is required.', 403);
      await this.limits.consume('requests', String(req.auth.extra?.grantId), 60);
      await audit(`grant:${req.auth.extra?.grantId}`, 'protocol_request', { clientId: req.auth.clientId,
        grantId: req.auth.extra?.grantId, ownerId: req.auth.extra?.ownerId });
      next();
    } catch (error) {
      const e = failure(error);
      if ([401, 403, 429].includes(e.status)) {
        try {
          if (e.status === 401) await this.limits.consume('unauthorized', req.ip || 'unknown', 30);
          await audit(undefined, 'authentication_denied', { clientId: req.auth?.clientId, code: e.code });
        }
        catch (storageError) { next(storageError); return; }
      }
      next(error);
    }
  };

  /** Verify the existing human app JWT and resolve permissions from current persisted account/profile data, ignoring caller-supplied roles. */
  human = async (req: McpAdminRequest, _res: Response, next: NextFunction) => {
    try {
      await this.limits.consume('admin-network', req.ip || 'unknown', 60);
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw new McpError('invalid_token', 'A human administrator JWT is required.', 401);
      let decoded: JwtPayload;
      try { decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload; }
      catch { throw new McpError('invalid_token', 'Invalid administrator JWT.', 401); }
      const userId = decoded.userId || decoded.id;
      if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) throw new McpError('invalid_token', 'Invalid administrator identity.', 401);
      const user = await Auth.findOne({ _id: userId, isActive: true, isEmailVerified: true }).lean();
      if (!user) throw new McpError('invalid_token', 'Administrator account is inactive or unverified.', 401);
      const profile = await Admin.findOne({ user: userId as any }).lean();
      const privileged = user.role?.includes('admin') || profile?.roles?.some(role => ['admin', 'developer'].includes(role));
      const permissions = [...(user.permissions || []), ...(profile?.permissions || [])];
      req.mcpAdmin = { id: String(user._id), manage: !!privileged || permissions.includes('mcp:manage'), review: !!privileged || permissions.includes('mcp:review') };
      if (!req.mcpAdmin.manage && !req.mcpAdmin.review) throw new McpError('forbidden', 'MCP administration permission is required.', 403);
      next();
    } catch (error) {
      try { await audit(req.mcpAdmin ? `admin:${req.mcpAdmin.id}` : undefined, 'admin_authentication_denied', { code: failure(error).code }); next(error); }
      catch (storageError) { next(storageError); }
    }
  };

  /** Require the specific human management or review capability before an administrative controller runs. */
  static authorize(permission: 'manage' | 'review') {
    return async (req: McpAdminRequest, _res: Response, next: NextFunction) => {
      if (req.mcpAdmin?.[permission]) { next(); return; }
      try {
        await audit(req.mcpAdmin ? `admin:${req.mcpAdmin.id}` : undefined, 'admin_authorization_denied', { code: 'forbidden', target: permission });
        next(new McpError('forbidden', `MCP ${permission} permission is required.`, 403));
      } catch (error) { next(error); }
    };
  }
}

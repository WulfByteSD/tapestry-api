import { AuthInfo } from '@modelcontextprotocol/server';
import { McpCredential } from '../model/McpCredential';
import { McpConfig } from '../types/McpTypes';
import { digest } from '../util/mcpCredentials';
import { McpError } from '../util/McpError';
import { loadActor } from './McpAccess.handler';

/** Verify only opaque credentials issued by this MCP authorization server. */
export class McpTokenHandler {
  constructor(private config: McpConfig) {}

  /** Re-resolve the live client, grant, and owner on every request; the SDK checks the exact resource audience too. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (!token || token.length > 512) throw new McpError('invalid_token', 'Invalid access token.', 401);
    const saved = await McpCredential.findOne({ hash: digest(token), kind: 'access', resource: this.config.resource,
      expiresAt: { $gt: new Date() }, revokedAt: null }).lean();
    if (!saved) throw new McpError('invalid_token', 'Invalid or expired access token.', 401);
    const actor = await loadActor(String(saved.grantId), saved.clientId, saved.scopes);
    if (actor.ownerId !== String(saved.ownerId)) throw new McpError('invalid_token', 'Token owner does not match the approved connection.', 401);
    return { token, clientId: actor.clientId, scopes: actor.capabilities, expiresAt: Math.floor(saved.expiresAt.getTime() / 1000),
      resource: new URL(this.config.resource), extra: { grantId: actor.grantId, ownerId: actor.ownerId, ceiling: saved.scopes } };
  }
}

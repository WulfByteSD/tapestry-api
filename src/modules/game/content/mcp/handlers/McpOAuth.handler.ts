import OAuth2Server from '@node-oauth/oauth2-server';
import Auth from '../../../../auth/model/Auth';
import { McpConfig } from '../types/McpTypes';
import { McpError } from '../util/McpError';
import { authorizationSchema, tokenSchema, consentSchema, requestedScopes } from '../util/oauthContracts';
import { opaque, digest, equalSecret } from '../util/mcpCredentials';
import { transaction } from '../util/mcpTransaction';
import { McpClient } from '../model/McpClient';
import { McpGrant } from '../model/McpGrant';
import { McpCredential } from '../model/McpCredential';
import { McpOAuthModel } from './McpOAuthModel.handler';
import { loadActor } from './McpAccess.handler';
import { audit } from './McpAudit.handler';

/** Coordinate consent, token exchange, and revocation without depending on Express request/response objects. */
export class McpOAuthHandler {
  constructor(private config: McpConfig) {}

  /** Validate preregistration and bind the browser's consent attempt to a short-lived, server-stored intent. */
  async beginConsent(input: unknown) {
    const query = authorizationSchema.parse(input);
    if (query.resource !== this.config.resource) throw new McpError('invalid_target', 'The requested resource is not this MCP server.');
    const scopes = requestedScopes(query.scope);
    const client = await McpClient.findOne({ clientId: query.client_id, kind: 'interactive', isActive: true }).lean();
    if (!client || !client.redirectUris.includes(query.redirect_uri)) throw new McpError('invalid_client', 'Client or callback is not preregistered.');
    const intent = opaque(), csrf = opaque();
    await McpCredential.create({ hash: digest(intent), kind: 'intent', clientId: client.clientId, resource: this.config.resource,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), csrfHash: digest(csrf), payload: query });
    return { name: client.name, scopes, intent, csrf };
  }

  /** Authenticate only the approved account, verify CSRF, and issue a code after explicit consent. */
  async finishConsent(input: unknown, csrfCookie: string, origin: string | undefined) {
    const body = consentSchema.parse(input);
    if (origin !== this.config.origin || !csrfCookie || body.csrf !== csrfCookie) throw new McpError('forbidden', 'Invalid consent origin or CSRF token.', 403);
    const intent = await McpCredential.findOne({ hash: digest(body.intent), kind: 'intent', resource: this.config.resource,
      consumedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
    if (!intent || !equalSecret(body.csrf, intent.csrfHash)) throw new McpError('invalid_request', 'Consent request expired or was already used.');
    const query = authorizationSchema.parse(intent.payload);
    const client = await McpClient.findOne({ clientId: query.client_id, kind: 'interactive', isActive: true }).lean();
    if (!client || !client.redirectUris.includes(query.redirect_uri)) throw new McpError('invalid_client', 'Client or callback is no longer approved.');
    if (body.decision === 'deny') {
      const consumed = await McpCredential.updateOne({ _id: intent._id, consumedAt: null, revokedAt: null }, { $set: { consumedAt: new Date() } });
      if (consumed.modifiedCount !== 1) throw new McpError('invalid_request', 'Consent request was already used.');
      await audit(undefined, 'oauth_consent_denied', { clientId: client.clientId });
      const redirect = new URL(query.redirect_uri); redirect.searchParams.set('error', 'access_denied'); redirect.searchParams.set('state', query.state);
      return redirect.href;
    }
    const user = await Auth.findOne({ email: body.email.trim().toLowerCase(), isActive: true, isEmailVerified: true }).select('+password');
    // Deliberately do not call AuthenticationHandler.login: its master-key shortcut is not allowed here.
    if (!user || !await user.matchPassword(body.password)) throw new McpError('access_denied', 'Invalid credentials or unapproved account.', 403);
    const grant = await McpGrant.findOne({ clientId: query.client_id, ownerId: user._id, kind: 'interactive', isActive: true }).lean();
    if (!grant) throw new McpError('access_denied', 'This account has no approved connection for this client.', 403);
    await loadActor(String(grant._id), client.clientId);
    return transaction(async session => {
      const consumed = await McpCredential.updateOne({ _id: intent._id, consumedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { session });
      if (consumed.modifiedCount !== 1) throw new McpError('invalid_request', 'Consent request expired or was already used.');
      const model = new McpOAuthModel(this.config, session, 'authorize');
      const server = this.server(model);
      const response = new OAuth2Server.Response();
      await server.authorize(new OAuth2Server.Request({ method: 'GET', headers: {}, query }), response,
        { authenticateHandler: { handle: async () => ({ id: String(user._id), grantId: String(grant._id), family: opaque() }) } });
      return response.get('location') as string;
    });
  }

  /** Exchange credentials through the OAuth library with an explicit audience and mandatory S256 code verification. */
  async exchange(input: unknown, headers: Record<string, string>) {
    const body = tokenSchema.parse(input);
    if (body.resource !== this.config.resource) throw new McpError('invalid_target', 'The requested resource is not this MCP server.');
    if (body.scope) requestedScopes(body.scope);
    if (body.grant_type === 'authorization_code' && (!body.code_verifier || !body.redirect_uri)) throw new McpError('invalid_request', 'Code exchange requires a PKCE verifier and exact callback.');
    let adapter: McpOAuthModel | undefined;
    try {
      return await transaction(async session => {
        adapter = new McpOAuthModel(this.config, session, 'token');
        const response = new OAuth2Server.Response();
        await this.server(adapter).token(new OAuth2Server.Request({ method: 'POST', headers, query: {}, body }), response);
        return { status: response.status || 200, headers: response.headers || {}, body: response.body };
      });
    } catch (error) {
      if (adapter?.replayFamily) {
        const family = adapter.replayFamily;
        await transaction(async session => {
          await McpCredential.updateMany({ family, resource: this.config.resource }, { $set: { revokedAt: new Date() } }, { session });
          await audit(undefined, 'oauth_refresh_replay', {}, session);
        });
      } else if (adapter?.consumedCode && error instanceof OAuth2Server.OAuthError && error.code < 500) {
        // Preserve the library's consume-on-failed-verifier behavior even though issuance rolled back.
        await McpCredential.updateOne({ hash: adapter.consumedCode, kind: 'code', consumedAt: null }, { $set: { consumedAt: new Date() } });
      }
      throw error;
    }
  }

  /** Revoke the entire presented credential's family. Unknown tokens return success without revealing storage state. */
  async revoke(rawToken: string, clientId: string, clientSecret?: string) {
    return transaction(async session => {
      const adapter = new McpOAuthModel(this.config, session, 'token');
      if (!await adapter.getClient(clientId, clientSecret)) throw new McpError('invalid_client', 'Invalid client credentials.', 401);
      const saved = await McpCredential.findOne({ hash: digest(rawToken), clientId, resource: this.config.resource, kind: { $in: ['access', 'refresh'] } }).session(session).lean();
      if (saved) {
        await McpCredential.updateMany({ family: saved.family, clientId }, { $set: { revokedAt: new Date() } }, { session });
        await audit(undefined, 'oauth_revoked', { clientId }, session);
      }
      return {};
    });
  }

  /** Configure only code, refresh, and client-credentials flows. Confidential-client enforcement remains per registered client. */
  private server(model: McpOAuthModel) {
    const options = { model: model as unknown as OAuth2Server.AuthorizationCodeModel,
      accessTokenLifetime: 900, refreshTokenLifetime: 604800, authorizationCodeLifetime: 300,
      allowEmptyState: false, alwaysIssueNewRefreshToken: true, enablePlainPKCE: false,
      requireClientAuthentication: { authorization_code: false, refresh_token: false, client_credentials: true } };
    return new OAuth2Server(options);
  }
}

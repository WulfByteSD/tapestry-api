import { ClientSession } from 'mongoose';
import OAuth2Server from '@node-oauth/oauth2-server';
import { McpClient } from '../model/McpClient';
import { McpGrant } from '../model/McpGrant';
import { McpCredential } from '../model/McpCredential';
import { Capability, McpConfig } from '../types/McpTypes';
import { opaque, digest, equalSecret } from '../util/mcpCredentials';
import { loadActor, touchActor } from './McpAccess.handler';
import { audit } from './McpAudit.handler';

/**
 * MongoDB adapter for the OAuth library. One instance belongs to one transaction,
 * so code consumption, refresh rotation, token issuance, and audit commit together.
 * All credentials are returned to their client once and stored only as hashes.
 */
export class McpOAuthModel {
  replayFamily?: string;
  consumedCode?: string;
  private authenticatedClientId?: string;

  constructor(private config: McpConfig, private session: ClientSession, private phase: 'authorize' | 'token') {}

  /** Resolve only preregistered clients, enforcing confidential-client authentication at the token endpoint. */
  async getClient(clientId: string, clientSecret?: string) {
    const client = await McpClient.findOne({ clientId, isActive: true }).select('+secretHash').session(this.session).lean();
    if (!client || (this.phase === 'token' && client.confidential && !equalSecret(clientSecret || '', client.secretHash))) return false;
    if (this.phase === 'token' && !client.confidential && clientSecret) return false;
    this.authenticatedClientId = clientId;
    return { id: clientId, grants: client.kind === 'machine' ? ['client_credentials'] : ['authorization_code', 'refresh_token'], redirectUris: client.redirectUris };
  }

  /** Machine clients act through their single administrator-approved grant, never through a fabricated system user. */
  async getUserFromClient(client: OAuth2Server.Client) {
    const grant = await McpGrant.findOne({ clientId: client.id, kind: 'machine', isActive: true }).session(this.session).lean();
    if (!grant) return false;
    const actor = await loadActor(String(grant._id), client.id, undefined, this.session);
    return { id: actor.ownerId, grantId: actor.grantId, family: opaque() };
  }

  /** Request only a subset of the live grant; omitted scopes default to reading and proposing. */
  async validateScope(user: any, client: OAuth2Server.Client, requested?: string[]) {
    const actor = await loadActor(user.grantId, client.id, user.ceiling, this.session);
    const scopes = requested?.length ? requested : ['read', 'propose'].filter(scope => actor.capabilities.includes(scope as Capability));
    return scopes.length && scopes.every(scope => actor.capabilities.includes(scope as Capability)) ? scopes : false;
  }

  /** Exact callback comparison prevents open redirects; the HTTP controller also validates before rendering consent. */
  async validateRedirectUri(uri: string, client: OAuth2Server.Client) { return client.redirectUris?.includes(uri) || false; }

  /** Use cryptographically random opaque credentials instead of app JWTs. */
  async generateAccessToken() { return opaque(); }
  /** Generate a new refresh token on every successful refresh. */
  async generateRefreshToken() { return opaque(); }
  /** Authorization codes are random, short-lived, single-use credentials. */
  async generateAuthorizationCode() { return opaque(); }

  /** Bind the authorization code to its approved account connection, exact callback, audience, and S256 challenge. */
  async saveAuthorizationCode(code: any, client: OAuth2Server.Client, user: any) {
    if (!code.codeChallenge || code.codeChallengeMethod !== 'S256') throw new OAuth2Server.InvalidRequestError('S256 PKCE is required.');
    const actor = await touchActor(await loadActor(user.grantId, client.id, undefined, this.session), this.session);
    await McpCredential.create([{ hash: digest(code.authorizationCode), kind: 'code', clientId: client.id, grantId: actor.grantId,
      ownerId: actor.ownerId, resource: this.config.resource, scopes: code.scope, family: user.family,
      redirectUri: code.redirectUri, codeChallenge: code.codeChallenge, expiresAt: code.expiresAt }], { session: this.session });
    await audit(actor, 'oauth_authorized', {}, this.session);
    return { ...code, client, user };
  }

  /** Reject replay, expiry, audience mismatch, missing PKCE, and revoked grants before code exchange. */
  async getAuthorizationCode(raw: string) {
    const saved = await this.credential('code', raw);
    if (!saved || saved.clientId !== this.authenticatedClientId || saved.consumedAt || !saved.codeChallenge) return false;
    const actor = await loadActor(String(saved.grantId), saved.clientId, saved.scopes, this.session);
    if (actor.ownerId !== String(saved.ownerId)) return false;
    return { authorizationCode: raw, expiresAt: saved.expiresAt, redirectUri: saved.redirectUri, scope: saved.scopes,
      codeChallenge: saved.codeChallenge, codeChallengeMethod: 'S256', client: { id: saved.clientId },
      user: { id: String(saved.ownerId), grantId: String(saved.grantId), ceiling: saved.scopes, family: saved.family } };
  }

  /** Atomically consume a code so concurrent exchanges cannot mint multiple token families. */
  async revokeAuthorizationCode(code: any) {
    const result = await McpCredential.updateOne({ hash: digest(code.authorizationCode), kind: 'code', consumedAt: null, revokedAt: null }, { $set: { consumedAt: new Date() } }, { session: this.session });
    if (result.modifiedCount === 1) this.consumedCode = digest(code.authorizationCode);
    return result.modifiedCount === 1;
  }

  /** Load a refresh token and flag family revocation when an already-consumed token is replayed. */
  async getRefreshToken(raw: string) {
    const saved = await this.credential('refresh', raw);
    if (!saved || saved.clientId !== this.authenticatedClientId) return false;
    if (saved.consumedAt) { this.replayFamily = saved.family; return false; }
    const actor = await loadActor(String(saved.grantId), saved.clientId, saved.scopes, this.session);
    if (actor.ownerId !== String(saved.ownerId)) return false;
    return { refreshToken: raw, refreshTokenExpiresAt: saved.expiresAt, scope: saved.scopes, client: { id: saved.clientId },
      user: { id: String(saved.ownerId), grantId: String(saved.grantId), ceiling: saved.scopes, family: saved.family } };
  }

  /** Consume the old refresh token in the issuance transaction; rollback leaves no partially rotated credential. */
  async revokeToken(token: any) {
    const result = await McpCredential.updateOne({ hash: digest(token.refreshToken), kind: 'refresh', consumedAt: null, revokedAt: null }, { $set: { consumedAt: new Date() } }, { session: this.session });
    return result.modifiedCount === 1;
  }

  /** Persist audience-bound hashes and current scope ceilings; never persist plaintext token response attributes. */
  async saveToken(token: any, client: OAuth2Server.Client, user: any) {
    const actor = await touchActor(await loadActor(user.grantId, client.id, user.ceiling, this.session), this.session);
    if (!token.scope?.every((scope: Capability) => actor.capabilities.includes(scope))) throw new OAuth2Server.InvalidScopeError('Requested scopes are no longer granted.');
    const identity = { clientId: client.id, grantId: actor.grantId, ownerId: actor.ownerId, resource: this.config.resource, scopes: token.scope, family: user.family };
    const credentials = [{ ...identity, hash: digest(token.accessToken), kind: 'access', expiresAt: token.accessTokenExpiresAt }];
    if (token.refreshToken) credentials.push({ ...identity, hash: digest(token.refreshToken), kind: 'refresh', expiresAt: token.refreshTokenExpiresAt });
    await McpCredential.create(credentials, { session: this.session, ordered: true });
    await audit(actor, 'oauth_token_issued', {}, this.session);
    return { ...token, client, user };
  }

  /** TTL cleanup is not an authorization check; expiry and revocation are checked explicitly on every lookup. */
  private async credential(kind: string, raw: string) {
    return McpCredential.findOne({ hash: digest(raw), kind, resource: this.config.resource, expiresAt: { $gt: new Date() }, revokedAt: null }).session(this.session).lean();
  }
}

import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import Auth from '../../../../../auth/model/Auth';
import { testRuntime, config, base, password } from '../../test/fixtures';
import { McpOAuthHandler } from '../McpOAuth.handler';
import { McpOAuthModel } from '../McpOAuthModel.handler';
import { McpTokenHandler } from '../McpToken.handler';
import { McpRateLimitHandler } from '../McpRateLimit.handler';
import { McpGrant } from '../../model/McpGrant';
import { McpCredential } from '../../model/McpCredential';
import { McpClient } from '../../model/McpClient';
import { McpAudit } from '../../model/McpAudit';
import { digest } from '../../util/mcpCredentials';
import { readConfig } from '../../util/mcpConfig';
import { createContentMcpRoutes } from '../../route';
import { transaction } from '../../util/mcpTransaction';
import { AuthMiddleware } from '../../../../../../middleware/AuthMiddleware';

jest.setTimeout(120000);
let runtime: Awaited<ReturnType<typeof testRuntime>>;
beforeAll(async () => { runtime = await testRuntime(); });
beforeEach(async () => { await runtime.reset(); });
afterAll(async () => { if (runtime) await runtime.close(); });
const verifier = 'a'.repeat(64);
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const callback = 'https://client.example.test/callback';

/** Prepare a real preregistered public-client account connection and complete its browser consent. */
async function interactive() {
  await runtime.admin.createClient(runtime.adminId, 'interactive-client', { clientId: 'interactive', name: '<script>untrusted</script>', kind: 'interactive', confidential: false, redirectUris: [callback] });
  await runtime.admin.createGrant(runtime.adminId, 'interactive-grant', { clientId: 'interactive', ownerId: runtime.ownerId, capabilities: ['read', 'propose'], contentTypes: ['items', 'settings'], settingKeys: ['alpha'], shared: false, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const handler = new McpOAuthHandler(config);
  const query = { client_id: 'interactive', redirect_uri: callback, response_type: 'code' as const, resource: config.resource, state: 'state-123', scope: 'read propose', code_challenge: challenge, code_challenge_method: 'S256' as const };
  const consent = await handler.beginConsent(query);
  const redirect = await handler.finishConsent({ intent: consent.intent, csrf: consent.csrf, email: 'owner@example.test', password, decision: 'approve' }, consent.csrf, config.origin);
  return { handler, query, code: new URL(redirect).searchParams.get('code')!, redirect };
}
async function codeToken(code: string, codeVerifier = verifier, callbackUri = callback) {
  return runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'authorization_code', client_id: 'interactive', resource: config.resource, redirect_uri: callbackUri, code, code_verifier: codeVerifier }));
}

test('MCP is disabled by default and invalid enabled configuration fails closed', () => {
  expect(readConfig({})).toBeNull();
  expect(() => readConfig({ CONTENT_MCP_ENABLED: 'true', CONTENT_MCP_URL: config.resource })).toThrow();
  expect(() => readConfig({ CONTENT_MCP_ENABLED: 'true', CONTENT_MCP_URL: config.resource.replace('https:', 'http:'), CONTENT_MCP_HOSTS: 'api.example.test', CONTENT_MCP_ORIGINS: config.origin })).toThrow();
  expect(() => readConfig({ CONTENT_MCP_ENABLED: 'true', CONTENT_MCP_URL: config.resource, CONTENT_MCP_HOSTS: '*', CONTENT_MCP_ORIGINS: config.origin })).toThrow();
  expect(readConfig({ CONTENT_MCP_ENABLED: 'true', CONTENT_MCP_URL: config.resource, CONTENT_MCP_HOSTS: 'api.example.test', CONTENT_MCP_ORIGINS: config.origin })?.resource).toBe(config.resource);
  expect(createContentMcpRoutes(null).stack).toHaveLength(0);
});

test('discovery and authentication challenges advertise this protected resource and supported OAuth flows', async () => {
  const challengeResponse = await runtime.request(base, 'POST', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  expect(challengeResponse.response.status).toBe(401);
  const challengeHeader = challengeResponse.response.headers.get('www-authenticate')!;
  expect(challengeHeader).toContain('oauth-protected-resource');
  const location = new URL(challengeHeader.match(/resource_metadata="([^"]+)"/)![1]).pathname;
  const metadata = await runtime.request(location);
  expect(metadata.data.resource).toBe(config.resource);
  expect(metadata.data.authorization_servers).toEqual([config.origin]);
  const oauth = await runtime.request('/.well-known/oauth-authorization-server');
  expect(oauth.data.code_challenge_methods_supported).toEqual(['S256']);
  expect(oauth.data.grant_types_supported).not.toContain('password');
  expect(oauth.data.registration_endpoint).toBeUndefined();
});

test('admin HTTP provisioning returns a secret once, creates a separate grant, and redacts secret hashes', async () => {
  const headers = { Authorization: `Bearer ${runtime.adminToken}` };
  const payload = { operationId: 'register', clientId: 'registered', name: 'Registered', kind: 'machine', confidential: true };
  const client = await runtime.request(base + '/admin/clients', 'POST', payload, headers);
  expect(client.response.status).toBe(200);
  expect(client.data.payload.clientSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(client.data.payload.secretHash).toBeUndefined();
  const replay = await runtime.request(base + '/admin/clients', 'POST', payload, headers);
  expect(replay.data.payload.clientSecret).toBeUndefined();
  const grant = await runtime.request(base + '/admin/grants', 'POST', { operationId: 'grant', clientId: 'registered', ownerId: runtime.ownerId,
    contentTypes: ['items'], settingKeys: ['alpha'], expiresAt: new Date(Date.now() + 86400000).toISOString() }, headers);
  expect(grant.response.status).toBe(200); expect(grant.data.payload.capabilities).toEqual(['read', 'propose']);
  const list = await runtime.request(base + '/admin/clients', 'GET', undefined, headers);
  expect(JSON.stringify(list.data)).not.toContain(client.data.payload.clientSecret);
  expect(JSON.stringify(list.data)).not.toContain('secretHash');
});

test('invalid registrations, unverified owners, and forged administrator roles do not gain platform access', async () => {
  const headers = { Authorization: `Bearer ${runtime.adminToken}` };
  expect((await runtime.request(base + '/admin/clients', 'POST', { operationId: 'invalid', name: 'Bad', kind: 'machine', confidential: false }, headers)).response.status).toBe(400);
  await Auth.updateOne({ _id: runtime.ownerId }, { $set: { isEmailVerified: false } });
  expect((await runtime.request(base + '/admin/grants', 'POST', { operationId: 'invalid-owner', clientId: 'test-machine', ownerId: runtime.ownerId,
    contentTypes: ['items'], settingKeys: ['alpha'], expiresAt: new Date(Date.now() + 86400000).toISOString() }, headers)).response.status).toBe(400);
  await Auth.updateOne({ _id: runtime.ownerId }, { $set: { isEmailVerified: true } });
  const forged = jwt.sign({ userId: runtime.ownerId, roles: ['admin'] }, process.env.JWT_SECRET!);
  expect((await runtime.request(base + '/admin/clients', 'GET', undefined, { Authorization: `Bearer ${forged}` })).response.status).toBe(403);
});

test('machine tokens require the registered secret, correct audience, allowed grant type and granted scopes', async () => {
  const form = { grant_type: 'client_credentials', client_id: 'test-machine', client_secret: runtime.secret, resource: config.resource, scope: 'read propose' };
  for (const bad of [{ client_secret: 'wrong' }, { resource: 'https://other.example.test/mcp' }, { grant_type: 'password' }, { scope: 'invented-scope' }]) {
    expect((await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ ...form, ...bad }))).response.status).not.toBe(200);
  }
  await runtime.restrict(['read', 'propose']);
  expect((await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ ...form, scope: 'read publish' }))).response.status).not.toBe(200);
  const token = await runtime.machineToken('read propose');
  const verified = await new McpTokenHandler(config).verifyAccessToken(token);
  expect(verified.clientId).toBe('test-machine'); expect(verified.scopes).toEqual(['read', 'propose']);
  const saved = await McpCredential.findOne({ hash: digest(token) }).lean();
  expect(saved.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(900000);
});

test('opaque MCP tokens and secrets are never persisted in plaintext or mixed with app JWT/internal-key credentials', async () => {
  const token = await runtime.machineToken();
  const records = await McpCredential.find().lean();
  expect(JSON.stringify(records)).not.toContain(token);
  expect(JSON.stringify(await McpAudit.find().lean())).not.toContain(runtime.secret);
  await expect(new McpTokenHandler(config).verifyAccessToken(runtime.adminToken)).rejects.toMatchObject({ code: 'invalid_token' });
  expect((await runtime.request(base, 'POST', {}, { Authorization: 'ApiKey existing-internal-key' })).response.status).toBe(401);
  const app = express(); app.get('/protected', AuthMiddleware.protect, (_req, res) => res.sendStatus(204));
  const listener = await new Promise<import('http').Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const response = await fetch(`http://127.0.0.1:${(listener.address() as import('net').AddressInfo).port}/protected`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(401);
  } finally { warn.mockRestore(); listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve())); }
});

test('inactive owners, expired credentials and revoked grants are checked on every request', async () => {
  const token = await runtime.machineToken(); const verifier = new McpTokenHandler(config);
  await Auth.updateOne({ _id: runtime.ownerId }, { $set: { isActive: false } });
  await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  await Auth.updateOne({ _id: runtime.ownerId }, { $set: { isActive: true } });
  await McpCredential.updateOne({ hash: digest(token) }, { $set: { expiresAt: new Date(0) } });
  await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  const fresh = await runtime.machineToken();
  await runtime.admin.updateGrant(runtime.adminId, 'revoke', runtime.grantId, { isActive: false });
  await expect(verifier.verifyAccessToken(fresh)).rejects.toMatchObject({ code: 'invalid_token' });
});

test('grant expansion does not silently upgrade an existing token, and secret rotation invalidates old families', async () => {
  const token = await runtime.machineToken('read propose');
  expect((await new McpTokenHandler(config).verifyAccessToken(token)).scopes).not.toContain('publish');
  const rotated = await runtime.admin.rotateSecret(runtime.adminId, 'rotate', 'test-machine');
  expect(rotated.clientSecret).not.toBe(runtime.secret);
  await expect(new McpTokenHandler(config).verifyAccessToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  expect((await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'client_credentials', client_id: 'test-machine', client_secret: runtime.secret, resource: config.resource }))).response.status).not.toBe(200);
});

test('consent requires exact callbacks, S256 PKCE, approved ownership and CSRF; client metadata is escaped', async () => {
  const auth = await interactive();
  for (const bad of [{ redirect_uri: callback + '/other' }, { code_challenge_method: 'plain' }, { code_challenge: undefined }]) await expect(auth.handler.beginConsent({ ...auth.query, ...bad })).rejects.toBeDefined();
  const consent = await auth.handler.beginConsent(auth.query);
  const form = { intent: consent.intent, csrf: consent.csrf, email: 'owner@example.test', password, decision: 'approve' };
  await expect(auth.handler.finishConsent(form, 'wrong', config.origin)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(auth.handler.finishConsent(form, consent.csrf, 'https://hostile.example.test')).rejects.toMatchObject({ code: 'forbidden' });
  const oldMaster = process.env.MASTER_KEY; process.env.MASTER_KEY = 'master-shortcut';
  try { await expect(auth.handler.finishConsent({ ...form, password: 'master-shortcut' }, consent.csrf, config.origin)).rejects.toMatchObject({ code: 'access_denied' }); }
  finally { if (oldMaster === undefined) delete process.env.MASTER_KEY; else process.env.MASTER_KEY = oldMaster; }
  const html = await runtime.request(base + '/oauth/authorize?' + new URLSearchParams(auth.query));
  expect(html.response.status).toBe(200); expect(html.data).toContain('&lt;script&gt;'); expect(html.data).not.toContain('<script>');
  expect(html.response.headers.get('set-cookie')).toContain('Secure');
  expect(html.response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
});

test('public-client code exchange, refresh rotation and the official interactive MCP client succeed', async () => {
  const auth = await interactive(); expect(new URL(auth.redirect).searchParams.get('state')).toBe('state-123');
  const first = await codeToken(auth.code); expect(first.response.status).toBe(200);
  expect((await codeToken(auth.code)).response.status).not.toBe(200);
  expect(first.data.refresh_token).toBeDefined();
  const refresh = await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'refresh_token', client_id: 'interactive', refresh_token: first.data.refresh_token, resource: config.resource }));
  expect(refresh.response.status).toBe(200); expect(refresh.data.refresh_token).not.toBe(first.data.refresh_token);
  const client = new Client({ name: 'interactive-smoke', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(runtime.url + base), { requestInit: { headers: { Host: 'api.example.test', Authorization: `Bearer ${refresh.data.access_token}` } } }));
    expect((await client.listTools()).tools.map(t => t.name)).toContain('content_propose');
    expect((await client.callTool({ name: 'content_context', arguments: {} })).isError).not.toBe(true);
  } finally { await client.close(); }
});

test('wrong verifier and callback cannot exchange a code; code replay cannot issue a second token', async () => {
  const auth = await interactive();
  expect((await codeToken(auth.code, 'b'.repeat(64))).response.status).not.toBe(200);
  expect((await codeToken(auth.code)).response.status).not.toBe(200);
  const consent = await auth.handler.beginConsent(auth.query);
  const redirect = await auth.handler.finishConsent({ intent: consent.intent, csrf: consent.csrf, email: 'owner@example.test', password, decision: 'approve' }, consent.csrf, config.origin);
  const code = new URL(redirect).searchParams.get('code')!;
  expect((await codeToken(code, verifier, callback + '/wrong')).response.status).not.toBe(200);
  expect(await McpCredential.countDocuments({ kind: 'access' })).toBe(0);
});

test('refresh replay revokes its entire family, including the replacement access token', async () => {
  const auth = await interactive(); const first = await codeToken(auth.code);
  const form = new URLSearchParams({ grant_type: 'refresh_token', client_id: 'interactive', refresh_token: first.data.refresh_token, resource: config.resource });
  const second = await runtime.request(base + '/oauth/token', 'POST', form); expect(second.response.status).toBe(200);
  expect((await runtime.request(base + '/oauth/token', 'POST', form)).response.status).not.toBe(200);
  await expect(new McpTokenHandler(config).verifyAccessToken(second.data.access_token)).rejects.toMatchObject({ code: 'invalid_token' });
});

test('unknown origins/hosts, oversized requests and excessive shared rates fail closed', async () => {
  expect((await runtime.request(base, 'POST', {}, { Origin: 'https://hostile.example.test' })).response.status).toBe(403);
  expect((await runtime.request(base, 'POST', {}, { Host: 'hostile.example.test' })).response.status).toBe(403);
  expect((await runtime.request(base, 'POST', { huge: 'x'.repeat(1024 * 1024) })).response.status).toBe(413);
  await expect(new McpRateLimitHandler({ eval: async () => 61 }).consume('requests', 'one-grant', 60)).rejects.toMatchObject({ status: 429 });
  await expect(new McpRateLimitHandler({ eval: async () => { throw new Error('Redis offline'); } }).consume('requests', 'one-grant', 60)).rejects.toMatchObject({ status: 503 });
  // Exercise the transaction capability gate without connecting to an application's standalone database.
  const admin = mongoose.connection.db!.admin.bind(mongoose.connection.db);
  const mock = jest.spyOn(mongoose.connection.db!, 'admin').mockImplementation(() => ({ ...admin(), command: async () => ({ isWritablePrimary: true }) }) as any);
  try { await expect(transaction(async () => 'never')).rejects.toMatchObject({ code: 'transactions_required' }); }
  finally { mock.mockRestore(); }
});

test('callback changes revoke existing credentials and stored hashes stay private', async () => {
  const auth = await interactive(); const first = await codeToken(auth.code);
  await runtime.admin.updateClient(runtime.adminId, 'callbacks', 'interactive', { redirectUris: ['https://client.example.test/new'] });
  await expect(new McpTokenHandler(config).verifyAccessToken(first.data.access_token)).rejects.toMatchObject({ code: 'invalid_token' });
  expect((await McpClient.findOne({ clientId: 'test-machine' }).lean()).secretHash).toBeUndefined();
});

test('interactive consent works over the mounted HTTP routes and can be declined without account credentials', async () => {
  const auth = await interactive();
  const begin = await runtime.request(base + '/oauth/authorize?' + new URLSearchParams(auth.query));
  const intent = begin.data.match(/name="intent" value="([^"]+)"/)[1];
  const csrf = begin.data.match(/name="csrf" value="([^"]+)"/)[1];
  const result = await runtime.request(base + '/oauth/authorize', 'POST', new URLSearchParams({ intent, csrf, email: 'owner@example.test', password, decision: 'approve' }),
    { Cookie: `tapestry_mcp_csrf=${csrf}`, Origin: config.origin });
  expect(result.response.status).toBe(303);
  const location = new URL(result.response.headers.get('location')!);
  expect(location.origin + location.pathname).toBe(callback);
  expect(location.searchParams.get('state')).toBe('state-123');
  expect(location.searchParams.has('password')).toBe(false);
  expect((await codeToken(location.searchParams.get('code')!)).response.status).toBe(200);
  const consent = await auth.handler.beginConsent(auth.query);
  const declined = new URL(await auth.handler.finishConsent({ intent: consent.intent, csrf: consent.csrf, decision: 'deny' }, consent.csrf, config.origin));
  expect(declined.searchParams.get('error')).toBe('access_denied');
  expect(declined.searchParams.has('code')).toBe(false);
});

test('confidential interactive clients require their secret even with valid S256 PKCE', async () => {
  const client = await runtime.admin.createClient(runtime.adminId, 'private-client', { clientId: 'private-interactive', name: 'Private', kind: 'interactive', confidential: true, redirectUris: [callback] });
  await runtime.admin.createGrant(runtime.adminId, 'private-grant', { clientId: 'private-interactive', ownerId: runtime.ownerId, capabilities: ['read', 'propose'], contentTypes: ['items'], settingKeys: ['alpha'], shared: false, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const handler = new McpOAuthHandler(config);
  const query = { client_id: 'private-interactive', redirect_uri: callback, response_type: 'code', resource: config.resource, state: 'state', code_challenge: challenge, code_challenge_method: 'S256' };
  const consent = await handler.beginConsent(query);
  const redirect = await handler.finishConsent({ intent: consent.intent, csrf: consent.csrf, email: 'owner@example.test', password, decision: 'approve' }, consent.csrf, config.origin);
  const form = { grant_type: 'authorization_code', client_id: 'private-interactive', resource: config.resource, redirect_uri: callback, code: new URL(redirect).searchParams.get('code')!, code_verifier: verifier };
  expect((await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams(form))).response.status).not.toBe(200);
  const valid = await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ ...form, client_secret: client.clientSecret }));
  expect(valid.response.status).toBe(200);
  const missing = await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'refresh_token', client_id: 'private-interactive', resource: config.resource, refresh_token: valid.data.refresh_token }));
  expect(missing.response.status).not.toBe(200);
});

test('client-authenticated revocation invalidates its token, and another client cannot revoke a refresh family', async () => {
  const auth = await interactive(); const issued = await codeToken(auth.code);
  const wrongClient = await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'refresh_token', client_id: 'test-machine', client_secret: runtime.secret,
    resource: config.resource, refresh_token: issued.data.refresh_token }));
  expect(wrongClient.response.status).not.toBe(200);
  await expect(new McpTokenHandler(config).verifyAccessToken(issued.data.access_token)).resolves.toBeDefined();
  const token = await runtime.machineToken();
  const revoke = await runtime.request(base + '/oauth/revoke', 'POST', new URLSearchParams({ token, client_id: 'test-machine', client_secret: runtime.secret }));
  expect(revoke.response.status).toBe(200);
  await expect(new McpTokenHandler(config).verifyAccessToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  const basic = Buffer.from(`test-machine:${runtime.secret}`).toString('base64');
  expect((await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'client_credentials', resource: config.resource, scope: 'read propose' }), { Authorization: `Basic ${basic}` })).response.status).toBe(200);
});

test('revoked consent intents and expired authorization codes cannot issue tokens', async () => {
  const auth = await interactive();
  await McpCredential.updateOne({ hash: digest(auth.code) }, { $set: { expiresAt: new Date(0) } });
  expect((await codeToken(auth.code)).response.status).not.toBe(200);
  const consent = await auth.handler.beginConsent(auth.query);
  await runtime.admin.updateClient(runtime.adminId, 'disable', 'interactive', { isActive: false });
  await runtime.admin.updateClient(runtime.adminId, 'reenable', 'interactive', { isActive: true });
  await expect(auth.handler.finishConsent({ intent: consent.intent, csrf: consent.csrf, email: 'owner@example.test', password, decision: 'approve' }, consent.csrf, config.origin)).rejects.toMatchObject({ code: 'invalid_request' });
  expect(await McpCredential.countDocuments({ kind: 'access' })).toBe(0);
});

test('OAuth storage exceptions fail closed without exposing wrapped server diagnostics', async () => {
  const mock = jest.spyOn(McpOAuthModel.prototype, 'getUserFromClient').mockRejectedValueOnce(new Error('sensitive-storage-detail'));
  try {
    const result = await runtime.request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'client_credentials', client_id: 'test-machine', client_secret: runtime.secret, resource: config.resource }));
    expect(result.response.status).toBe(503);
    expect(JSON.stringify(result.data)).not.toContain('sensitive-storage-detail');
    expect(result.data.error).toBe('unavailable');
  } finally { mock.mockRestore(); }
});

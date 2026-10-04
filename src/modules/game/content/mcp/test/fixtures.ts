import mongoose from 'mongoose';
import express from 'express';
import http from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Auth from '../../../../auth/model/Auth';
import { storageModels } from '../model';
import { contentModels } from '../util/contentRegistry';
import { createContentMcpRoutes } from '../route';
import { McpAdminHandler } from '../handlers/McpAdmin.handler';
import { ContentWriteHandler } from '../handlers/ContentWrite.handler';
import { McpConfig, CAPABILITIES, CONTENT_TYPES } from '../types/McpTypes';
import { McpGrant } from '../model/McpGrant';
import { loadActor } from '../handlers/McpAccess.handler';

export const config: McpConfig = { resource: 'https://api.example.test/api/v1/game/content/mcp', origin: 'https://api.example.test', hosts: ['api.example.test'], origins: ['https://api.example.test', 'https://editor.example.test'] };
export const base = '/api/v1/game/content/mcp';
export const password = 'CorrectPassword123!';

/** A private replica set and HTTP listener exercise production handlers without any app database or Redis dependency. */
export async function testRuntime() {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri(), { dbName: 'tapestry_mcp_isolated_test' });
  await Promise.all([...storageModels, ...Object.values(contentModels)].map(model => model.init()));
  const app = express();
  app.use(createContentMcpRoutes(config, { eval: async () => 1 }));
  const server = await new Promise<http.Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const url = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
  // Node fetch derives Host from the connection URL. Permit this exact private listener only in the test config.
  config.hosts.push(new URL(url).host);
  const writes = new ContentWriteHandler();
  const admin = new McpAdminHandler(writes);
  const oldJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-test-secret-do-not-use-in-production';
  let ownerId = '', adminId = '', secret = '', adminToken = '', grantId = '';

  /** Reset only collections in this private test database, retaining their unique indexes. */
  async function reset() {
    await Promise.all([...storageModels, ...Object.values(contentModels), Auth].map(model => model.deleteMany({})));
    const hashed = await bcrypt.hash(password, 4);
    const owner = new mongoose.Types.ObjectId(), administrator = new mongoose.Types.ObjectId();
    // Raw inserts avoid the legacy Auth save hooks; password matching still uses the actual bcrypt model method.
    await Auth.collection.insertMany([{ _id: owner, email: 'owner@example.test', password: hashed, role: ['user'], permissions: [], isActive: true, isEmailVerified: true },
      { _id: administrator, email: 'admin@example.test', password: hashed, role: ['admin'], permissions: [], isActive: true, isEmailVerified: true }]);
    ownerId = String(owner); adminId = String(administrator);
    adminToken = jwt.sign({ userId: adminId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    await contentModels.settings.create([{ key: 'alpha', name: 'Alpha', status: 'published' }, { key: 'beta', name: 'Beta', status: 'published' }]);
    const client = await admin.createClient(adminId, 'fixture-client', { clientId: 'test-machine', name: 'Test machine', kind: 'machine', confidential: true, redirectUris: [] });
    secret = client.clientSecret;
    const grant = await admin.createGrant(adminId, 'fixture-grant', { clientId: 'test-machine', ownerId, capabilities: [...CAPABILITIES], contentTypes: [...CONTENT_TYPES], settingKeys: ['alpha'], shared: false, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    grantId = String(grant._id);
  }

  /** Make real HTTP requests while presenting the configured reverse-proxy hostname. */
  async function request(path: string, method = 'GET', body?: any, headers: Record<string, string> = {}) {
    // Native HTTP retains explicit Host so host-denial tests exercise the actual middleware.
    const response = await new Promise<Response>((resolve, reject) => {
      const req = http.request(url + path, { method, headers: { Host: 'api.example.test', ...(body ? { 'Content-Type': body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...headers } }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode!, headers: res.headers as Record<string, string> })));
      });
      req.on('error', reject);
      req.end(body ? body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) : undefined);
    });
    const text = await response.text();
    return { response, data: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
  }

  /** Obtain an actual machine access token through the mounted token endpoint. */
  async function machineToken(scope = 'read propose create update bulk publish read:draft read:archived') {
    const result = await request(base + '/oauth/token', 'POST', new URLSearchParams({ grant_type: 'client_credentials', client_id: 'test-machine', client_secret: secret, resource: config.resource, scope }));
    if (result.response.status !== 200) throw new Error(JSON.stringify(result.data));
    return result.data.access_token as string;
  }

  /** Tear down only this test's listener, replica set, and temporary secret override. */
  async function close() {
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    await mongoose.disconnect();
    await repl.stop();
    config.hosts.splice(config.hosts.indexOf(new URL(url).host), 1);
    if (oldJwtSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwtSecret;
  }
  return { reset, request, machineToken, close, writes, admin, url,
    actor: () => loadActor(grantId, 'test-machine'),
    get ownerId() { return ownerId; }, get adminId() { return adminId; }, get secret() { return secret; }, get adminToken() { return adminToken; }, get grantId() { return grantId; },
    restrict: (capabilities: string[]) => McpGrant.updateOne({ _id: grantId }, { $set: { capabilities } }),
  };
}

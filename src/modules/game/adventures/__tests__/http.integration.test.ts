import express from 'express';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { PassThrough, Readable } from 'stream';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import errorHandler from '../../../../middleware/error';
import Auth from '../../../auth/model/Auth';
import Admin from '../../../profiles/admin/model/AdminModel';
import Player from '../../../profiles/player/model/PlayerModel';
import Resource from '../../../library/models/Resource';
import RAG from '../../../library/models/RAG';
import Product from '../../../commerce/models/ProductModel';
import commerceRoutes from '../../../commerce/routes';
import Campaign from '../../campaigns/model/CampaignModel';
import campaignRoutes from '../../campaigns/routes';
import { Adventure } from '../models/AdventureModel';
import { AdventureShare } from '../models/AdventureShareModel';
import AdventureAttachmentHandler from '../handlers/AdventureAttachment.handler';
import { createAdventureRoutes } from '../routes/index';

// Only external storage and UUID generation are mocked. JWT middleware, routers, services and MongoDB are real.
jest.mock('../../../upload/handlers/CloudinaryHandler', () => ({ CloudinaryHandler: jest.fn() }));
jest.mock('cloudinary', () => ({ v2: { uploader: { upload_stream: jest.fn(), destroy: jest.fn() }, utils: { private_download_url: jest.fn() } } }));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('uuid', () => ({ v4: () => 'test-claim-source' }));

const integration = process.env.ADVENTURE_TEST_MONGO_BINARY ? describe : describe.skip;
integration('real HTTP adventure boundaries', () => {
  const testJwtKey = 'synthetic-adventure-http-test-key-not-an-application-secret';
  const accounts = ['admin', 'owner', 'guest', 'outsider'] as const;
  type Account = typeof accounts[number];
  const ids = Object.fromEntries(accounts.map(name => [name, new mongoose.Types.ObjectId()])) as Record<Account, mongoose.Types.ObjectId>;
  const tokens = Object.fromEntries(accounts.map(name => [name, jwt.sign({ userId: String(ids[name]) }, testJwtKey, { expiresIn: '1h' })])) as Record<Account, string>;
  let mongo: MongoMemoryServer, server: Server, base: string;
  let adventureId: string, libraryId: string, campaignId: string, productId: string;
  let ownerProfile: string, guestProfile: string;

  async function call(path: string, who?: Account, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, {
      method, redirect: 'manual', headers: { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}),
        ...(who === 'admin' ? { 'x-service-name': 'admin' } : {}),
        ...(body !== undefined ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body).buffer : JSON.stringify(body),
    });
    const text = await response.text();
    let data: any; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, headers: response.headers, text, data };
  }
  const root = '/api/v1/game/adventures';
  const shared = () => `${root}/campaigns/${campaignId}/${adventureId}/resources/letter`;

  beforeAll(async () => {
    // Set a synthetic key in this isolated test process; do not load/read application environment files or secrets.
    process.env.JWT_SECRET = testJwtKey;
    mongo = await MongoMemoryServer.create({ binary: { systemBinary: process.env.ADVENTURE_TEST_MONGO_BINARY! }, instance: { dbName: 'adventure_http_test' } });
    await mongoose.connect(mongo.getUri('adventure_http_test'));
    await Promise.all([Adventure.init(), AdventureShare.init(), Resource.init(), Player.init(), Product.init(), Auth.init()]);
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(root, createAdventureRoutes());
    app.use('/api/v1/game/campaigns', campaignRoutes);
    app.use('/api/v1/commerce', commerceRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60000);
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    await mongoose.disconnect(); if (mongo) await mongo.stop();
    delete process.env.JWT_SECRET;
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await Promise.all([Adventure.deleteMany({}), AdventureShare.deleteMany({}), Resource.deleteMany({}), RAG.deleteMany({}),
      Player.deleteMany({}), Admin.deleteMany({}), Auth.deleteMany({}), Campaign.deleteMany({}), Product.deleteMany({})]);
    await Auth.collection.insertMany(accounts.map(name => ({ _id: ids[name], email: `${name}@example.test`, permissions: [], isActive: true })));
    await new Admin({ user: ids.admin, roles: ['admin'], permissions: [] }).save();
    ownerProfile = String((await new Player({ user: ids.owner, roles: ['storyweaver'] }).save())._id);
    guestProfile = String((await new Player({ user: ids.guest, roles: ['player'] }).save())._id);
    await new Player({ user: ids.outsider, roles: ['player'] }).save();
    libraryId = String((await new Resource({ key: 'http-adventure', slug: 'http-adventure', title: 'HTTP Adventure', kind: 'module', format: 'web',
      status: 'published', accessPolicy: 'entitlement', currentRelease: { version: '1', provider: 'external' } }).save())._id);
    productId = String((await new Product({ key: 'http-adventure', slug: 'http-adventure', title: 'HTTP Adventure', status: 'published', visibility: 'public',
      pricing: { type: 'free', currency: 'USD', amountCents: 0 }, fulfillment: { kind: 'digital', grants: [{ type: 'resource', resourceId: libraryId, permissions: ['view'] }] } }).save())._id);
    const created = await call(`${root}/admin`, 'admin', 'POST', { libraryResourceId: libraryId, content: {
      title: 'Published title', sections: [{ id: 'a', title: 'A', storyText: 'Published scene', resourceIds: ['letter'] }, { id: 'c', title: 'C' }],
      resources: [{ id: 'letter', title: 'Letter', kind: 'handout', visibility: 'players', text: 'Published text' },
        { id: 'notes', title: 'Secret notes', kind: 'storyweaver_note', text: 'PRIVATE_NOTES' },
        { id: 'hidden', title: 'Unshared', kind: 'handout', visibility: 'players' }],
    } });
    expect(created.status).toBe(201); adventureId = created.data.payload.id;
    await new AdventureAttachmentHandler().saveAsset({ userId: String(ids.admin), permissions: ['admin'] }, adventureId, 'letter', 0,
      { publicId: 'OLD_PRIVATE_ID', resourceType: 'raw', format: 'pdf', contentType: 'application/pdf', bytes: 5 });
    expect((await call(`${root}/admin/${adventureId}/status`, 'admin', 'PATCH', { revision: 1, status: 'published' })).status).toBe(200);
    expect((await call(`/api/v1/commerce/products/${productId}/claim`, 'owner', 'POST', {})).status).toBe(200);
    campaignId = String((await new Campaign({ name: 'HTTP campaign', owner: ownerProfile, status: 'active', members: [{ player: guestProfile, role: 'player' }] }).save())._id);
    (cloudinary.utils.private_download_url as jest.Mock).mockReturnValue('https://api.cloudinary.com/SIGNED_SOURCE_SECRET');
    (axios.get as jest.Mock).mockImplementation(async () => ({ data: Readable.from(Buffer.from('BYTES')) }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('enforces actual JWT authentication and admin-profile permissions on read, write and delivery routes', async () => {
    for (const path of [`${root}/${adventureId}`, `${root}/admin`, `${root}/${adventureId}/resources/letter/asset`])
      expect((await call(path)).status).toBe(401);
    expect((await call(`${root}/${adventureId}`, undefined, 'GET', undefined, { Authorization: 'Bearer invalid-token' })).status).toBe(401);
    expect((await call(`${root}/admin`, 'owner')).status).toBe(403);
    expect((await call(`${root}/admin/${adventureId}`, 'owner', 'PUT', {})).status).toBe(403);
    expect((await call(`${root}/${adventureId}`, 'guest')).status).toBe(404);
    expect((await call(`${root}/${adventureId}/resources/letter/asset`, 'guest')).status).toBe(404);
    expect((await call(`${root}/${adventureId}/sections/c`, 'owner')).status).toBe(200);
    expect((await call(`${root}/admin/${adventureId}`, 'admin')).status).toBe(200);
    expect(axios.get).not.toHaveBeenCalled();
  });
  it('uses the existing free-claim HTTP route and does not duplicate repeat grants', async () => {
    const repeated = await call(`/api/v1/commerce/products/${productId}/claim`, 'owner', 'POST', {});
    expect(repeated.data.payload.alreadyOwned).toBe(true);
    expect(await RAG.countDocuments({ userId: ownerProfile, resourceId: libraryId })).toBe(1);
    expect((await call(`${root}/${adventureId}`, 'guest')).status).toBe(404);
    expect((await call(`/api/v1/commerce/products/${productId}/claim`, 'guest', 'POST', {})).status).toBe(200);
    expect((await call(`${root}/${adventureId}`, 'guest')).status).toBe(200);
  });
  it.each(['owner', 'sw', 'co-sw'])('preserves %s campaign update/delete authority', async role => {
    const who = role === 'owner' ? 'owner' : 'guest';
    if (role !== 'owner') await Campaign.updateOne({ _id: campaignId }, { $set: { 'members.0.role': role } });
    expect((await call(`/api/v1/game/campaigns/${campaignId}`, who, 'PUT', { name: 'Renamed' })).status).toBe(201);
    expect((await call(`/api/v1/game/campaigns/${campaignId}`, who, 'DELETE')).status).toBe(201);
  });
  it.each(['player', 'observer', 'outsider'])('blocks %s campaign update/delete escalation', async role => {
    if (role === 'observer') await Campaign.updateOne({ _id: campaignId }, { $set: { 'members.0.role': 'observer' } });
    const who = role === 'outsider' ? 'outsider' : 'guest';
    expect((await call(`/api/v1/game/campaigns/${campaignId}`, who, 'PUT', { members: [{ player: guestProfile, role: 'sw' }] })).status).toBe(403);
    expect((await call(`/api/v1/game/campaigns/${campaignId}`, who, 'DELETE')).status).toBe(403);
    expect(await Campaign.exists({ _id: campaignId })).not.toBeNull();
  });
  it('shares only selected safe resources and revokes on unshare and member removal', async () => {
    expect((await call(shared(), 'owner', 'PUT', {})).status).toBe(200);
    expect((await call(shared(), 'guest')).status).toBe(200);
    expect((await call(shared().replace('/letter', '/notes'), 'guest')).status).toBe(404);
    expect((await call(shared().replace('/letter', '/hidden'), 'guest')).status).toBe(404);
    expect((await call(`${root}/campaigns/${campaignId}/resources`, 'guest')).text).not.toMatch(/PRIVATE_NOTES|OLD_PRIVATE_ID|Unshared/);
    expect((await call(shared(), 'owner', 'DELETE')).status).toBe(204);
    expect((await call(shared(), 'guest')).status).toBe(404);
    await call(shared(), 'owner', 'PUT', {});
    expect((await call(`/api/v1/game/campaigns/${campaignId}/members/${guestProfile}`, 'owner', 'DELETE')).status).toBe(200);
    expect((await call(shared() + '/asset', 'guest')).status).toBe(404);
    expect(axios.get).not.toHaveBeenCalled();
  });
  it.each(['archived', 'deleted'])('keeps owner fallback after the campaign is %s while denying nonowners', async state => {
    await call(shared(), 'owner', 'PUT', {});
    if (state === 'deleted') await call(`/api/v1/game/campaigns/${campaignId}`, 'owner', 'DELETE');
    else await call(`/api/v1/game/campaigns/${campaignId}`, 'owner', 'PUT', { status: 'archived' });
    expect((await call(shared(), 'guest')).status).toBe(404);
    const owned = await call(shared() + '/asset', 'owner');
    expect(owned.status).toBe(200); expect(owned.text).toBe('BYTES');
    expect(owned.headers.get('location')).toBeNull(); expect(owned.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each(['revoked', 'expired', 'past', 'download-only', 'deleted'])('revokes every derived HTTP read after supplier grant is %s, then restores on regrant', async state => {
    await call(shared(), 'owner', 'PUT', {});
    const filter = { userId: ownerProfile, resourceId: libraryId };
    if (state === 'deleted') await RAG.deleteMany(filter);
    else await RAG.updateMany(filter, { $set: state === 'past' ? { expiresAt: new Date(0) } :
      state === 'download-only' ? { permissions: ['download'] } : { status: state } });
    expect((await call(`${root}/${adventureId}`, 'owner')).status).toBe(404);
    expect((await call(shared().replace('/letter', '/hidden'), 'owner', 'PUT', {})).status).toBe(404);
    expect((await call(`${root}/campaigns/${campaignId}/resources`, 'guest')).data.payload).toEqual([]);
    expect((await call(shared(), 'guest')).status).toBe(404);
    expect((await call(shared() + '/asset', 'guest')).status).toBe(404);
    expect(axios.get).not.toHaveBeenCalled();
    // The existing free-claim path may issue a new grant; shares depend on the profile's current ownership, not an old grant ID.
    expect((await call(`/api/v1/commerce/products/${productId}/claim`, 'owner', 'POST', {})).status).toBe(200);
    expect((await call(`${root}/campaigns/${campaignId}/resources`, 'guest')).data.payload).toHaveLength(1);
    expect((await call(shared(), 'guest')).status).toBe(200);
    expect((await call(shared() + '/asset', 'guest')).text).toBe('BYTES');
    expect((await call(shared(), 'owner', 'DELETE')).status).toBe(204);
    expect((await call(shared(), 'guest')).status).toBe(404);
  });
  it('keeps independent ownership without transferring an existing share to another entitled Storyweaver', async () => {
    await call(shared(), 'owner', 'PUT', {});
    await call(`/api/v1/commerce/products/${productId}/claim`, 'guest', 'POST', {});
    const outsiderProfile = String((await Player.findOne({ user: ids.outsider as any }))!._id);
    await Campaign.updateOne({ _id: campaignId }, { $set: { members: [
      { player: guestProfile, role: 'co-sw' }, { player: outsiderProfile, role: 'player' },
    ] } });
    await RAG.updateMany({ userId: ownerProfile, resourceId: libraryId }, { $set: { status: 'revoked' } });
    expect((await call(`${root}/campaigns/${campaignId}/resources`, 'guest')).data.payload).toHaveLength(1);
    expect((await call(shared(), 'guest')).status).toBe(200);
    expect((await call(shared() + '/asset', 'guest')).text).toBe('BYTES');
    expect((await call(shared(), 'guest', 'PUT', {})).status).toBe(200);
    expect((await AdventureShare.findOne({ campaignId }))?.sharedByPlayerId).toBe(ownerProfile);
    expect((await call(`${root}/campaigns/${campaignId}/resources`, 'outsider')).data.payload).toEqual([]);
    expect((await call(shared(), 'outsider')).status).toBe(404);
    const storageReads = (axios.get as jest.Mock).mock.calls.length;
    expect((await call(shared() + '/asset', 'outsider')).status).toBe(404);
    expect(axios.get).toHaveBeenCalledTimes(storageReads);
    expect((await call(shared().replace('/letter', '/hidden'), 'guest', 'PUT', {})).status).toBe(200);
    expect((await call(shared().replace('/letter', '/hidden'), 'outsider')).status).toBe(200);
    expect((await call(shared(), 'outsider')).status).toBe(404);
    // Changing the supplier requires explicit removal followed by a new share.
    expect((await call(shared(), 'guest', 'DELETE')).status).toBe(204);
    expect((await call(shared(), 'guest', 'PUT', {})).status).toBe(200);
    expect((await AdventureShare.findOne({ campaignId, resourceId: 'letter' }))?.sharedByPlayerId).toBe(guestProfile);
    expect((await call(shared(), 'outsider')).status).toBe(200);
  });
  it('does not leak signed URLs or redirects through attachment errors', async () => {
    (axios.get as jest.Mock).mockRejectedValue({ message: 'SIGNED_SOURCE_SECRET', response: { status: 302, headers: { location: 'SIGNED_SOURCE_SECRET' } } });
    const failed = await call(`${root}/${adventureId}/resources/letter/asset`, 'owner');
    expect(failed.status).toBe(502); expect(failed.text).not.toContain('SIGNED_SOURCE_SECRET'); expect(failed.headers.get('location')).toBeNull();
    expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxRedirects: 0 }));
  });
  it('keeps draft assets and associations hidden through the actual upload and publish endpoints', async () => {
    await call(shared(), 'owner', 'PUT', {});
    const draft = (await call(`${root}/admin/${adventureId}`, 'admin')).data.payload;
    const content = { title: 'DRAFT_TITLE', sections: draft.sections.map((section: any) => ({ ...section, storyText: 'DRAFT_SCENE', resourceIds: ['hidden'] })),
      resources: draft.resources.map(({ hasAsset, asset, ...resource }: any) => ({ ...resource, text: 'DRAFT_TEXT' })), encounters: draft.encounters };
    expect((await call(`${root}/admin/${adventureId}`, 'admin', 'PUT', { revision: 2, content })).status).toBe(200);
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((options, callback) => {
      const stream = new PassThrough(); stream.resume();
      stream.on('finish', () => callback(null, { public_id: 'NEW_PRIVATE_ID', type: 'authenticated', resource_type: 'raw', bytes: 9 }));
      return stream;
    });
    expect((await call(`${root}/admin/${adventureId}/resources/letter/asset?revision=3`, 'admin', 'POST', Buffer.from('%PDF-1.7\n'))).status).toBe(200);
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(expect.objectContaining({ type: 'authenticated', resource_type: 'raw' }), expect.any(Function));
    const prior = await call(`${root}/${adventureId}`, 'owner');
    expect(prior.text).not.toMatch(/DRAFT_|NEW_PRIVATE_ID|OLD_PRIVATE_ID/);
    expect(prior.data.payload.sections[0].resourceIds).toEqual(['letter']);
    await call(shared() + '/asset', 'guest');
    expect(cloudinary.utils.private_download_url).toHaveBeenLastCalledWith('OLD_PRIVATE_ID', '', expect.objectContaining({ type: 'authenticated' }));
    expect((await call(`${root}/admin/${adventureId}/status`, 'admin', 'PATCH', { revision: 4, status: 'published' })).status).toBe(200);
    const published = await call(`${root}/${adventureId}`, 'owner');
    expect(published.data.payload.sections[0].resourceIds).toEqual(['hidden']);
    expect(published.data.payload.title).toBe('DRAFT_TITLE');
    await call(shared() + '/asset', 'guest');
    expect(cloudinary.utils.private_download_url).toHaveBeenLastCalledWith('NEW_PRIVATE_ID', '', expect.objectContaining({ type: 'authenticated' }));
  });
});

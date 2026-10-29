import express from 'express';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import routes from '../routes';
import errorHandler from '../../../../middleware/error';
import Auth from '../../../auth/model/Auth';
import Player from '../../../profiles/player/model/PlayerModel';
import Campaign from '../../campaigns/model/CampaignModel';
import Character from '../../characters/model/CharacterModel';
import Combatant from '../../content/model/CombatantModel';
import { EncounterDraftModel } from '../models/EncounterDraft.model';
import { EncounterLibraryModel } from '../models/EncounterLibrary.model';

// Real HTTP, JWT authorization and MongoDB. No application models or handlers are mocked.
const integration = process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY ? describe : describe.skip;
integration('encounter preparation HTTP boundaries', () => {
  const names = ['owner', 'cosw', 'sw', 'player', 'observer', 'outsider'] as const;
  type Account = typeof names[number];
  const secret = 'synthetic-encounter-test-key-not-an-application-secret';
  const root = '/api/v1/game';
  let mongo: MongoMemoryServer, server: Server, base: string, campaignId: string, otherCampaignId: string;
  let profiles: Record<Account, string>, tokens: Record<Account, string>;
  const snapshot = { name: 'Lantern keeper', category: 'npc', disposition: 'neutral', tier: 'II', origin: 'Mortal', role: 'Guardian',
    statline: { hp: 10, defenseTN: 11, harm: 'Light (2)', armor: 0, move: 'Near', actions: 1, tags: [] }, notes: { gm: 'Private encounter notes' } };
  const draftPath = () => `${root}/campaigns/${campaignId}/encounter-drafts`;
  async function call(path: string, who?: Account, method = 'GET', body?: unknown) {
    const response = await fetch(base + path, { method, headers: { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  }
  async function draft() {
    const response = await call(draftPath(), 'owner', 'POST', { title: 'At the bridge', notes: 'A quiet meeting' });
    expect(response.status).toBe(201);
    return response.data.payload;
  }
  async function template(who: Account = 'owner') {
    const response = await call(`${root}/encounter-library`, who, 'POST', { snapshot });
    expect(response.status).toBe(201);
    return response.data.payload;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { systemBinary: process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY! }, instance: { dbName: 'encounter_http_test' } });
    await mongoose.connect(mongo.getUri('encounter_http_test'));
    await Promise.all([Player.init(), EncounterDraftModel.init(), EncounterLibraryModel.init()]);
    const app = express();
    app.use(express.json());
    app.use(root, routes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60000);
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
    delete process.env.JWT_SECRET;
  });
  beforeEach(async () => {
    await Promise.all([Auth.deleteMany({}), Player.deleteMany({}), Campaign.deleteMany({}), Character.deleteMany({}), Combatant.deleteMany({}), EncounterDraftModel.deleteMany({}), EncounterLibraryModel.deleteMany({})]);
    profiles = {} as Record<Account, string>; tokens = {} as Record<Account, string>;
    for (const name of names) {
      const userId = new mongoose.Types.ObjectId();
      await Auth.collection.insertOne({ _id: userId, email: `${name}@example.test`, permissions: [], isActive: true });
      profiles[name] = String((await new Player({ user: userId }).save())._id);
      tokens[name] = jwt.sign({ userId: String(userId) }, secret, { expiresIn: '1h' });
    }
    campaignId = String((await new Campaign({ name: 'First table', owner: profiles.owner, status: 'active', members: [
      { player: profiles.owner, role: 'sw' }, { player: profiles.cosw, role: 'co-sw' }, { player: profiles.sw, role: 'sw' },
      { player: profiles.player, role: 'player' }, { player: profiles.observer, role: 'observer' },
    ] }).save())._id);
    otherCampaignId = String((await new Campaign({ name: 'Other table', owner: profiles.owner, status: 'active' }).save())._id);
  });
  it('requires authentication and scopes personal library to player profile ownership', async () => {
    expect((await call(`${root}/encounter-library`)).status).toBe(401);
    const entry = await template();
    expect(String((await EncounterLibraryModel.findById(entry.id))!.owner)).toBe(profiles.owner);
    expect((await call(`${root}/encounter-library`, 'outsider')).data.payload).toEqual([]);
    for (const who of ['cosw', 'outsider'] as const) {
      expect((await call(`${root}/encounter-library/${entry.id}`, who)).status).toBe(404);
      expect((await call(`${root}/encounter-library/${entry.id}`, who, 'PATCH', { revision: 0, snapshot: { ...snapshot, name: 'Stolen' } })).status).toBe(404);
    }
    expect((await call(`${root}/encounter-library`, 'owner', 'POST', { snapshot, owner: profiles.outsider })).status).toBe(400);
    expect(await Combatant.countDocuments()).toBe(0);
  });
  it('limits every draft surface to owner, SW or co-SW and denies archived mutations', async () => {
    const encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const entry = await template();
    const added = await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'personal', id: entry.id } });
    const participantPath = `${path}/participants/${added.data.payload.participants[0].id}`;
    for (const who of ['owner', 'cosw', 'sw'] as const) expect((await call(path, who)).status).toBe(200);
    for (const who of ['player', 'observer', 'outsider'] as const) {
      expect((await call(draftPath(), who)).status).toBe(403);
      expect((await call(path, who)).status).toBe(403);
      expect((await call(`${draftPath()}/characters`, who)).status).toBe(403);
      expect((await call(draftPath(), who, 'POST', { title: 'Forbidden' })).status).toBe(403);
      expect((await call(path, who, 'PATCH', { revision: 0, notes: 'Forbidden' })).status).toBe(403);
      expect((await call(`${path}/participants`, who, 'POST', { revision: 0, source: { kind: 'character', id: new mongoose.Types.ObjectId().toHexString() } })).status).toBe(403);
      expect((await call(participantPath, who, 'PATCH', { revision: 1, snapshot })).status).toBe(403);
      expect((await call(participantPath, who, 'DELETE', { revision: 1 })).status).toBe(403);
      expect((await call(`${participantPath}/duplicate`, who, 'POST', { revision: 1 })).status).toBe(403);
    }
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'archived' } });
    expect((await call(path, 'owner')).status).toBe(200);
    expect((await call(path, 'owner', 'PATCH', { revision: 0, notes: 'No' })).status).toBe(403);
    expect((await call(draftPath(), 'cosw', 'POST', { title: 'No' })).status).toBe(403);
    expect((await call(participantPath, 'owner', 'PATCH', { revision: 1, snapshot })).status).toBe(403);
    expect((await call(participantPath, 'owner', 'DELETE', { revision: 1 })).status).toBe(403);
    expect((await call(`${participantPath}/duplicate`, 'cosw', 'POST', { revision: 1 })).status).toBe(403);
  });
  it('validates both character attachment and current member ownership and exposes only safe display fields', async () => {
    const encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const valid = await Character.create({ player: profiles.player, campaign: campaignId, name: 'Aster', sheet: { profile: { bio: 'PRIVATE_BIO' }, resources: { hp: { current: 3, max: 10 } } } });
    const detached = await Character.create({ player: profiles.player, name: 'Detached' });
    const foreign = await Character.create({ player: profiles.player, campaign: otherCampaignId, name: 'Foreign' });
    const mismatched = await Character.create({ player: profiles.outsider, campaign: campaignId, name: 'Wrong owner' });
    const unlisted = await Character.create({ player: profiles.player, campaign: campaignId, name: 'Unlisted' });
    await Campaign.updateOne({ _id: campaignId, 'members.player': profiles.player } as any, { $set: { 'members.$.characters': [valid._id, detached._id, foreign._id, mismatched._id] } });
    const roster = await call(`${draftPath()}/characters`, 'owner');
    expect(roster.data.payload.map((row: any) => row.id)).toEqual([String(valid._id)]);
    expect(JSON.stringify(roster.data)).not.toMatch(/PRIVATE_BIO|current|resources|profile|player/);
    for (const bad of [detached, foreign, mismatched, unlisted]) expect((await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'character', id: String(bad._id) } })).status).toBe(400);
    const added = await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'character', id: String(valid._id) } });
    expect(added.status).toBe(200);
    const participant = added.data.payload.participants[0];
    expect(Object.keys(participant.snapshot).sort()).toEqual(['name', 'weaveLevel']);
    expect((await call(`${path}/participants`, 'owner', 'POST', { revision: 1, source: { kind: 'character', id: String(valid._id) } })).status).toBe(400);
    expect((await call(`${path}/participants/${participant.id}/duplicate`, 'owner', 'POST', { revision: 1 })).status).toBe(400);
    expect((await call(`${path}/participants/${participant.id}`, 'owner', 'PATCH', { revision: 1, snapshot })).status).toBe(400);
    expect((await call(`${path}/participants/${participant.id}`, 'owner', 'DELETE', { revision: 1 })).status).toBe(200);
  });
  it('makes independent personal and catalog copies and permits co-SW editing only the encounter copy', async () => {
    const encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const entry = await template();
    const otherDraft = (await call(`${root}/campaigns/${otherCampaignId}/encounter-drafts`, 'owner', 'POST', { title: 'Elsewhere' })).data.payload;
    const otherPath = `${root}/campaigns/${otherCampaignId}/encounter-drafts/${otherDraft.id}`;
    expect((await call(`${otherPath}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'personal', id: entry.id } })).status).toBe(200);
    expect((await call(`${path}/participants`, 'cosw', 'POST', { revision: 0, source: { kind: 'personal', id: entry.id } })).status).toBe(404);
    const added = await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'personal', id: entry.id } });
    expect(added.status).toBe(200);
    const participantId = added.data.payload.participants[0].id;
    const duplicate = await call(`${path}/participants/${participantId}/duplicate`, 'cosw', 'POST', { revision: 1 });
    expect(duplicate.status).toBe(200);
    expect(duplicate.data.payload.participants[1].id).not.toBe(participantId);
    expect((await call(`${root}/encounter-library/${entry.id}`, 'owner', 'PATCH', { revision: 0, snapshot: { ...snapshot, name: 'New template' } })).status).toBe(200);
    const edited = await call(`${path}/participants/${participantId}`, 'cosw', 'PATCH', { revision: 2, snapshot: { ...snapshot, name: 'Scene copy' } });
    expect(edited.status).toBe(200);
    expect(edited.data.payload.participants.map((p: any) => p.snapshot.name)).toEqual(['Scene copy', snapshot.name]);
    expect((await call(`${root}/encounter-library/${entry.id}`, 'owner')).data.payload.snapshot.name).toBe('New template');
    expect((await call(otherPath, 'owner')).data.payload.participants[0].snapshot.name).toBe(snapshot.name);
    const catalog = await Combatant.create({ ...snapshot, key: 'catalog', status: 'published' });
    const catalogAdded = await call(`${path}/participants`, 'owner', 'POST', { revision: 3, source: { kind: 'catalog', id: String(catalog._id) } });
    expect(catalogAdded.status).toBe(200);
    await Combatant.updateOne({ _id: catalog._id }, { $set: { name: 'Changed catalog' } });
    expect((await call(path, 'owner')).data.payload.participants[2].snapshot.name).toBe(snapshot.name);
    const listing = await call(`${draftPath()}?keyword=bridge&pageLimit=1`, 'owner');
    expect(listing.data.payload[0].participantCount).toBe(3);
    expect(listing.data.payload[0]).not.toHaveProperty('participants');
    expect(listing.data.payload[0]).not.toHaveProperty('notes');
    expect((await Character.countDocuments())).toBe(0);
  });
  it('rejects unpublished catalog, cross-campaign drafts and strict malformed payloads', async () => {
    const encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const hidden = await Combatant.create({ ...snapshot, key: 'hidden', status: 'draft' });
    expect((await call(`${root}/encounter-library/catalog`, 'owner')).data.payload).toEqual([]);
    expect((await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'catalog', id: String(hidden._id) } })).status).toBe(404);
    const foreignPath = `${root}/campaigns/${otherCampaignId}/encounter-drafts/${encounter.id}`;
    expect((await call(foreignPath, 'owner')).status).toBe(404);
    expect((await call(foreignPath, 'owner', 'PATCH', { revision: 0, title: 'No' })).status).toBe(404);
    for (const bad of [{ ...snapshot, statline: { ...snapshot.statline, hp: 0 } }, { ...snapshot, statline: { ...snapshot.statline, actions: 0 } }, { ...snapshot, liveHp: 1 }])
      expect((await call(`${root}/encounter-library`, 'owner', 'POST', { snapshot: bad })).status).toBe(400);
    expect((await call(path, 'owner', 'PATCH', { revision: 0, notes: 'x'.repeat(20001) })).status).toBe(400);
    expect((await call(path, 'owner', 'PATCH', { revision: 0, participants: [] })).status).toBe(400);
    expect((await call(path, 'owner', 'PATCH', { notes: 'Missing revision' })).status).toBe(400);
  });
  it.each([undefined, '', ' ', 'Threat', 'Fragile', 'VI', 'ii', ' II ', 2, null])('rejects tier %p on every authored snapshot route without changing stored records', async tier => {
    const entry = await template();
    const encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const added = await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'personal', id: entry.id } });
    const participantPath = `${path}/participants/${added.data.payload.participants[0].id}`;
    const invalidSnapshot = { ...snapshot, tier };
    const results = [
      await call(`${root}/encounter-library`, 'owner', 'POST', { snapshot: invalidSnapshot }),
      await call(`${root}/encounter-library/${entry.id}`, 'owner', 'PATCH', { revision: 0, snapshot: invalidSnapshot }),
      await call(participantPath, 'owner', 'PATCH', { revision: 1, snapshot: invalidSnapshot }),
    ];
    for (const result of results) {
      expect(result.status).toBe(400);
      expect(result.data.message).toBe('snapshot.tier: Choose a tier from I to V.');
    }
    expect(await EncounterLibraryModel.countDocuments()).toBe(1);
    const stored = (await call(`${root}/encounter-library/${entry.id}`, 'owner')).data.payload;
    expect(stored.revision).toBe(0); expect(stored.snapshot.tier).toBe('II');
    const unchanged = (await call(path, 'owner')).data.payload;
    expect(unchanged.revision).toBe(1); expect(unchanged.participants[0].snapshot.tier).toBe('II');
  });
  it.each(['I', 'II', 'III', 'IV', 'V'])('accepts tier %s on all authored snapshot routes', async tier => {
    const authored = { ...snapshot, tier };
    const created = await call(`${root}/encounter-library`, 'owner', 'POST', { snapshot: authored });
    expect(created.status).toBe(201); expect(created.data.payload.snapshot.tier).toBe(tier);
    const updated = await call(`${root}/encounter-library/${created.data.payload.id}`, 'owner', 'PATCH', { revision: 0, snapshot: authored });
    expect(updated.status).toBe(200); expect(updated.data.payload.snapshot.tier).toBe(tier);
    const encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const added = await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'personal', id: created.data.payload.id } });
    const edited = await call(`${path}/participants/${added.data.payload.participants[0].id}`, 'cosw', 'PATCH', { revision: 1, snapshot: authored });
    expect(edited.status).toBe(200); expect(edited.data.payload.participants[0].snapshot.tier).toBe(tier);
  });
  it.each([undefined, '', 'Threat'])('keeps legacy tier %p readable, addable and duplicable until explicitly edited', async tier => {
    const { tier: _tier, ...withoutTier } = snapshot;
    const legacy = { ...withoutTier, ...(tier === undefined ? {} : { tier }) };
    // Seed pre-existing records directly; new HTTP writes must use a canon tier.
    const entry = await EncounterLibraryModel.create({ owner: profiles.owner, snapshot: legacy });
    const catalog = { _id: new mongoose.Types.ObjectId(), ...legacy, key: 'legacy', status: 'published', createdAt: new Date(), updatedAt: new Date() };
    await Combatant.collection.insertOne(catalog);
    const participantId = new mongoose.Types.ObjectId().toHexString();
    const encounter = await EncounterDraftModel.create({ campaign: campaignId, title: 'Legacy draft', participants: [
      { id: participantId, kind: 'combatant', provenance: { kind: 'personal', id: String(entry._id) }, snapshot: legacy },
    ] });
    const path = `${draftPath()}/${encounter._id}`;
    expect((await call(`${root}/encounter-library/${entry._id}`, 'owner')).data.payload.snapshot).toEqual(legacy);
    expect((await call(`${root}/encounter-library`, 'owner')).data.payload[0].snapshot).toEqual(legacy);
    const catalogList = await call(`${root}/encounter-library/catalog`, 'owner');
    expect(catalogList.status).toBe(200); expect(catalogList.data.payload[0].snapshot.tier).toBe(tier);
    expect((await call(path, 'owner')).data.payload.participants[0].snapshot).toEqual(legacy);
    expect((await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'personal', id: String(entry._id) } })).status).toBe(200);
    expect((await call(`${path}/participants`, 'owner', 'POST', { revision: 1, source: { kind: 'catalog', id: String(catalog._id) } })).status).toBe(200);
    const duplicated = await call(`${path}/participants/${participantId}/duplicate`, 'cosw', 'POST', { revision: 2 });
    expect(duplicated.status).toBe(200); expect(duplicated.data.payload.participants).toHaveLength(4);
    for (const participant of duplicated.data.payload.participants) expect(participant.snapshot.tier).toBe(tier);
    const edited = await call(`${path}/participants/${participantId}`, 'cosw', 'PATCH', { revision: 3, snapshot: { ...legacy, tier: 'III' } });
    expect(edited.status).toBe(200); expect(edited.data.payload.participants[0].snapshot.tier).toBe('III');
    for (const participant of edited.data.payload.participants.slice(1)) expect(participant.snapshot.tier).toBe(tier);
    expect((await call(`${root}/encounter-library/${entry._id}`, 'owner')).data.payload.snapshot).toEqual(legacy);
    expect((await Combatant.findById(catalog._id).lean())!.tier).toBe(tier);
  });
  it('atomically rejects competing edits without losing either accepted state or independent notes', async () => {
    const encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const results = await Promise.all(['One', 'Two'].map(title => call(path, 'owner', 'PATCH', { revision: 0, title })));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const current = (await call(path, 'owner')).data.payload;
    expect(current.revision).toBe(1); expect(current.notes).toBe('A quiet meeting');
    expect(current.title).toBe(results.find(result => result.status === 200)!.data.payload.title);
    const entry = await template();
    const added = await call(`${path}/participants`, 'owner', 'POST', { revision: 1, source: { kind: 'personal', id: entry.id } });
    expect(added.data.payload.notes).toBe(current.notes);
    expect((await call(path, 'owner', 'PATCH', { revision: 1, notes: 'Stale overwrite' })).status).toBe(409);
    expect((await call(path, 'owner')).data.payload.participants).toHaveLength(1);
  });
  it('persists repeated turn slots, current selection and inherited round order independently of the roster', async () => {
    let encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    expect(encounter.turnOrder).toEqual({ round: 1, slots: [], currentSlotId: null });
    const entry = await template();
    encounter = (await call(`${path}/participants`, 'owner', 'POST', { revision: encounter.revision, source: { kind: 'personal', id: entry.id } })).data.payload;
    encounter = (await call(`${path}/participants/${encounter.participants[0].id}/duplicate`, 'cosw', 'POST', { revision: encounter.revision })).data.payload;
    const roster = encounter.participants;
    const command = async (action: Record<string, unknown>) => {
      const result = await call(`${path}/turn-order`, 'sw', 'POST', { revision: encounter.revision, ...action });
      expect(result.status).toBe(200); encounter = result.data.payload;
    };
    await command({ action: 'add', participantId: roster[0].id });
    expect(encounter.participants).toEqual(roster);
    expect(new Set(encounter.turnOrder.slots.map((slot: any) => slot.id)).size).toBe(3);
    expect(encounter.turnOrder.slots.map((slot: any) => slot.participantId)).toEqual([roster[0].id, roster[1].id, roster[0].id]);
    await command({ action: 'advance' });
    const currentId = encounter.turnOrder.currentSlotId;
    const reordered = [...encounter.turnOrder.slots].reverse();
    await command({ action: 'reorder', slotIds: reordered.map((slot: any) => slot.id) });
    expect(encounter.turnOrder.currentSlotId).toBe(currentId);
    expect(encounter.participants).toEqual(roster);
    await command({ action: 'advance' });
    expect(encounter.turnOrder).toEqual({ round: 2, slots: reordered, currentSlotId: reordered[0].id });
    await command({ action: 'select', slotId: reordered[1].id });
    expect(encounter.turnOrder.round).toBe(2);
    await command({ action: 'next-round' });
    expect(encounter.turnOrder).toEqual({ round: 3, slots: reordered, currentSlotId: reordered[0].id });
    expect((await call(path, 'cosw')).data.payload).toEqual(encounter);
    expect(encounter.notes).toBe('A quiet meeting');
    expect((await call(`${root}/encounter-library/${entry.id}`, 'owner')).data.payload.snapshot).toEqual(snapshot);
  });
  it('derives stable legacy turns and reconciles late roster additions and removal of every repeated turn', async () => {
    let encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const entry = await template();
    for (let i = 0; i < 2; i++) encounter = (await call(`${path}/participants`, 'owner', 'POST', { revision: encounter.revision, source: { kind: 'personal', id: entry.id } })).data.payload;
    await EncounterDraftModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(encounter.id) }, { $unset: { turnOrder: '' } });
    encounter = (await call(path, 'owner')).data.payload;
    const legacy = { round: 1, slots: encounter.participants.map((item: any) => ({ id: item.id, participantId: item.id })), currentSlotId: null };
    expect(encounter.turnOrder).toEqual(legacy);
    expect((await call(path, 'owner')).data.payload.turnOrder).toEqual(legacy);
    expect(await EncounterDraftModel.collection.findOne({ _id: new mongoose.Types.ObjectId(encounter.id) })).not.toHaveProperty('turnOrder');
    const command = async (action: Record<string, unknown>) => {
      const result = await call(`${path}/turn-order`, 'owner', 'POST', { revision: encounter.revision, ...action });
      expect(result.status).toBe(200); encounter = result.data.payload;
    };
    const first = encounter.participants[0].id;
    await command({ action: 'add', participantId: first });
    await command({ action: 'advance' });
    await command({ action: 'next-round' });
    const beforeLateAdd = encounter.turnOrder;
    encounter = (await call(`${path}/participants`, 'owner', 'POST', { revision: encounter.revision, source: { kind: 'personal', id: entry.id } })).data.payload;
    expect(encounter.turnOrder.slots.slice(0, -1)).toEqual(beforeLateAdd.slots);
    expect(encounter.turnOrder.currentSlotId).toBe(beforeLateAdd.currentSlotId);
    expect(encounter.turnOrder.round).toBe(2);
    const nextId = encounter.turnOrder.slots[1].id;
    const removed = await call(`${path}/participants/${first}`, 'owner', 'DELETE', { revision: encounter.revision });
    expect(removed.status).toBe(200); encounter = removed.data.payload;
    expect(encounter.turnOrder.slots).toHaveLength(2);
    expect(encounter.turnOrder.slots.every((slot: any) => slot.participantId !== first)).toBe(true);
    expect(encounter.turnOrder.currentSlotId).toBe(nextId);
    expect(encounter.turnOrder.round).toBe(2);
    await command({ action: 'select', slotId: encounter.turnOrder.slots[1].id });
    await command({ action: 'remove', slotId: encounter.turnOrder.currentSlotId });
    expect(encounter.turnOrder.currentSlotId).toBe(nextId);
    await command({ action: 'remove', slotId: nextId });
    expect(encounter.turnOrder).toEqual({ round: 2, slots: [], currentSlotId: null });
    expect(encounter.participants).toHaveLength(2);
    for (const action of ['advance', 'next-round']) expect((await call(`${path}/turn-order`, 'owner', 'POST', { revision: encounter.revision, action })).status).toBe(400);
  });
  it('protects all turn-order commands by campaign role, archive status, scope and atomic revision', async () => {
    let encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const entry = await template();
    encounter = (await call(`${path}/participants`, 'owner', 'POST', { revision: encounter.revision, source: { kind: 'personal', id: entry.id } })).data.payload;
    const participantId = encounter.participants[0].id, slotId = encounter.turnOrder.slots[0].id;
    const actions = [{ action: 'advance' }, { action: 'next-round' }, { action: 'add', participantId }, { action: 'remove', slotId }, { action: 'select', slotId }, { action: 'reorder', slotIds: [slotId] }];
    for (const action of actions) {
      expect((await call(`${path}/turn-order`, undefined, 'POST', { revision: 1, ...action })).status).toBe(401);
      for (const who of ['player', 'observer', 'outsider'] as const) expect((await call(`${path}/turn-order`, who, 'POST', { revision: 1, ...action })).status).toBe(403);
    }
    expect((await call(`${root}/campaigns/${otherCampaignId}/encounter-drafts/${encounter.id}/turn-order`, 'owner', 'POST', { revision: 1, action: 'advance' })).status).toBe(404);
    const competing = await Promise.all([
      call(`${path}/turn-order`, 'owner', 'POST', { revision: 1, action: 'advance' }),
      call(path, 'cosw', 'PATCH', { revision: 1, notes: 'Concurrent notes' }),
    ]);
    expect(competing.map((result) => result.status).sort()).toEqual([200, 409]);
    const accepted = competing.find((result) => result.status === 200)!.data.payload;
    expect((await call(path, 'owner')).data.payload).toEqual(accepted);
    for (const action of actions) expect((await call(`${path}/turn-order`, 'sw', 'POST', { revision: 1, ...action })).status).toBe(409);
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'archived' } });
    for (const action of actions) expect((await call(`${path}/turn-order`, 'cosw', 'POST', { revision: 2, ...action })).status).toBe(403);
    expect((await call(path, 'owner')).data.payload).toEqual(accepted);
  });
  it('rejects invalid turn IDs, malformed permutations, unsupported writes and bounded state without mutation', async () => {
    let encounter = await draft(); const path = `${draftPath()}/${encounter.id}`;
    const entry = await template();
    encounter = (await call(`${path}/participants`, 'owner', 'POST', { revision: 0, source: { kind: 'personal', id: entry.id } })).data.payload;
    const participantId = encounter.participants[0].id, slotId = encounter.turnOrder.slots[0].id;
    const absent = new mongoose.Types.ObjectId().toHexString();
    for (const action of [{ action: 'add', participantId: absent }, { action: 'select', slotId: absent }, { action: 'remove', slotId: absent }])
      expect((await call(`${path}/turn-order`, 'owner', 'POST', { revision: 1, ...action })).status).toBe(404);
    for (const body of [
      { revision: 1, action: 'reorder', slotIds: [] }, { revision: 1, action: 'reorder', slotIds: [slotId, slotId] },
      { revision: 1, action: 'reorder', slotIds: [absent] }, { revision: 1, action: 'add', participantId: 'invalid' },
      { revision: 1, action: 'advance', round: 99 }, { action: 'advance' }, { revision: -1, action: 'advance' }, { revision: 1, action: 'reset' },
    ]) expect((await call(`${path}/turn-order`, 'owner', 'POST', body)).status).toBe(400);
    expect((await call(path, 'owner', 'PATCH', { revision: 1, turnOrder: { round: 99, slots: [], currentSlotId: null } })).status).toBe(400);
    expect((await call(path, 'owner')).data.payload).toEqual(encounter);
    const full = { round: 1000000, slots: Array.from({ length: 200 }, () => ({ id: new mongoose.Types.ObjectId().toHexString(), participantId })), currentSlotId: null as string | null };
    full.currentSlotId = full.slots[199].id;
    await EncounterDraftModel.updateOne({ _id: encounter.id }, { $set: { turnOrder: full } });
    for (const action of [{ action: 'add', participantId }, { action: 'advance' }, { action: 'next-round' }])
      expect((await call(`${path}/turn-order`, 'owner', 'POST', { revision: 1, ...action })).status).toBe(400);
    expect((await call(`${path}/participants`, 'owner', 'POST', { revision: 1, source: { kind: 'personal', id: entry.id } })).status).toBe(400);
    const unchanged = (await call(path, 'owner')).data.payload;
    expect(unchanged.revision).toBe(1); expect(unchanged.participants).toEqual(encounter.participants); expect(unchanged.turnOrder).toEqual(full);
  });
});

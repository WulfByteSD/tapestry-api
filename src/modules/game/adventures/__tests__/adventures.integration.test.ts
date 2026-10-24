import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AdventureAuthoringHandler from '../handlers/AdventureAuthoring.handler';
import AdventureReferenceHandler from '../handlers/AdventureReference.handler';
import AdventureSharingHandler from '../handlers/AdventureSharing.handler';
import AdventureAttachmentHandler from '../handlers/AdventureAttachment.handler';
import AdventureAccessHandler from '../handlers/AdventureAccess.handler';
import { adventureView, materialView } from '../helpers/adventure.helpers';
import { Adventure } from '../models/AdventureModel';
import { AdventureShare } from '../models/AdventureShareModel';
import Player from '../../../profiles/player/model/PlayerModel';
import Resource from '../../../library/models/Resource';
import RAG from '../../../library/models/RAG';
import Campaign from '../../campaigns/model/CampaignModel';
import Combatant from '../../content/model/CombatantModel';
import { RAGHandler } from '../../../library/handlers/Rag.handler';

// Explicit opt-in to a preinstalled local binary. Never download a database or use an application connection string.
const integration = process.env.ADVENTURE_TEST_MONGO_BINARY ? describe : describe.skip;
integration('adventure persistence and revocation (isolated MongoDB)', () => {
  let mongo: MongoMemoryServer;
  const authoring = new AdventureAuthoringHandler();
  const reference = new AdventureReferenceHandler();
  const sharing = new AdventureSharingHandler();
  const attachments = new AdventureAttachmentHandler();
  const access = new AdventureAccessHandler();
  const admin = { userId: new mongoose.Types.ObjectId().toString(), permissions: ['admin'] };
  const owner = { userId: new mongoose.Types.ObjectId().toString(), permissions: [] };
  const guest = { userId: new mongoose.Types.ObjectId().toString(), permissions: [] };
  let moduleId: string, libraryId: string, campaignId: string, ownerProfile: string, guestProfile: string;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { systemBinary: process.env.ADVENTURE_TEST_MONGO_BINARY! }, instance: { dbName: 'adventure_test' } });
    await mongoose.connect(mongo.getUri('adventure_test'));
    await Promise.all([Adventure.init(), AdventureShare.init(), Player.init(), Resource.init()]);
  }, 60000);
  afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
  beforeEach(async () => {
    await Promise.all([Adventure.deleteMany({}), AdventureShare.deleteMany({}), Player.deleteMany({}), Resource.deleteMany({}), RAG.deleteMany({}), Campaign.deleteMany({}), Combatant.deleteMany({})]);
    ownerProfile = String((await new Player({ user: owner.userId, roles: ['storyweaver'] }).save())._id);
    guestProfile = String((await new Player({ user: guest.userId, roles: ['player'] }).save())._id);
    libraryId = String((await Resource.create({ key: 'adventure', slug: 'adventure', title: 'Adventure', kind: 'module', format: 'web',
      status: 'published', accessPolicy: 'entitlement', currentRelease: { version: '1', provider: 'external' } }))._id);
    const module = await authoring.create(admin, { libraryResourceId: libraryId, content: { title: 'Adventure',
      sections: [{ id: 'a', title: 'A', links: [{ sectionId: 'c', label: 'Go directly to C' }], resourceIds: ['handout'] },
        { id: 'b', title: 'B' }, { id: 'c', title: 'C', links: [{ sectionId: 'a', label: 'Return' }] }],
      resources: [{ id: 'handout', title: 'Letter', kind: 'handout', visibility: 'players', text: 'Read aloud' },
        { id: 'other', title: 'Other letter', kind: 'handout', visibility: 'players', text: 'Unrevealed' },
        { id: 'notes', title: 'Secrets', kind: 'storyweaver_note', text: 'SECRET' }] } });
    moduleId = String(module._id);
    await authoring.changeStatus(admin, moduleId, { revision: 0, status: 'published' });
    await new RAGHandler().grantAccessForUser({ authUserId: owner.userId, resourceId: libraryId, permissions: ['view'], source: { type: 'claim' } });
    campaignId = String((await new Campaign({ name: 'Campaign', owner: ownerProfile, status: 'active', members: [{ player: guestProfile, role: 'player' }] }).save())._id);
  });

  it('persists references, freely navigable cycles and a module-wide entitlement', async () => {
    const module = await reference.ownerRead(owner, moduleId);
    expect(module.sections[0].links[0].sectionId).toBe('c');
    expect(module.sections[2].links[0].sectionId).toBe('a');
    expect(adventureView(module).resources).toHaveLength(3);
    await expect(reference.ownerRead(guest, moduleId)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('keeps grants idempotent through the existing claim grant handler', async () => {
    const result = await new RAGHandler().grantAccessForUser({ authUserId: owner.userId, resourceId: libraryId, permissions: ['view'], source: { type: 'claim' } });
    expect(result.status).toBe('already_owned');
    expect(await RAG.countDocuments({ resourceId: libraryId, userId: ownerProfile })).toBe(1);
  });
  it('handles repeated/concurrent shares without duplicates, then immediately unshares', async () => {
    await Promise.all([sharing.share(owner, campaignId, moduleId, 'handout'), sharing.share(owner, campaignId, moduleId, 'handout')]);
    expect(await AdventureShare.countDocuments({ campaignId, adventureId: moduleId })).toBe(1);
    expect(await AdventureShare.findOne({ campaignId }).lean()).toMatchObject({ resourceId: 'handout', sharedByPlayerId: ownerProfile });
    expect((await sharing.sharedList(guest, campaignId)).map(entry => entry.id)).toEqual(['handout']);
    expect((await sharing.sharedRead(guest, campaignId, moduleId, 'handout')).text).toBe('Read aloud');
    await expect(sharing.sharedRead(guest, campaignId, moduleId, 'other')).rejects.toMatchObject({ statusCode: 404 });
    await expect(sharing.sharedRead(guest, campaignId, moduleId, 'notes')).rejects.toMatchObject({ statusCode: 404 });
    await sharing.unshare(owner, campaignId, moduleId, 'handout');
    await sharing.unshare(owner, campaignId, moduleId, 'handout');
    await expect(sharing.sharedRead(guest, campaignId, moduleId, 'handout')).rejects.toMatchObject({ statusCode: 404 });
  });
  it.each(['archived', 'draft', 'deleted', 'removed'])('revokes shared access after %s and retains entitlement fallback', async state => {
    await sharing.share(owner, campaignId, moduleId, 'handout');
    if (state === 'deleted') await Campaign.deleteOne({ _id: campaignId });
    else if (state === 'removed') await Campaign.updateOne({ _id: campaignId }, { $set: { members: [] } });
    else await Campaign.updateOne({ _id: campaignId }, { $set: { status: state } });
    await expect(sharing.sharedRead(guest, campaignId, moduleId, 'handout')).rejects.toMatchObject({ statusCode: 404 });
    expect((await sharing.sharedRead(owner, campaignId, moduleId, 'handout')).id).toBe('handout');
  });
  it.each(['revoked', 'expired', 'past', 'download-only'])('rejects %s ownership grants', async kind => {
    await RAG.updateOne({ resourceId: libraryId }, { $set: kind === 'past' ? { expiresAt: new Date(0) } :
      kind === 'download-only' ? { permissions: ['download'] } : { status: kind } });
    await expect(reference.ownerRead(owner, moduleId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(sharing.share(owner, campaignId, moduleId, 'handout')).rejects.toMatchObject({ statusCode: 404 });
  });
  it('does not grant access when the entitlement belongs to another module', async () => {
    await RAG.updateOne({ resourceId: libraryId }, { $set: { resourceId: new mongoose.Types.ObjectId().toString() } });
    await expect(reference.ownerRead(owner, moduleId)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('revokes owner and campaign reads when publication is withdrawn', async () => {
    await sharing.share(owner, campaignId, moduleId, 'handout');
    await authoring.changeStatus(admin, moduleId, { revision: 1, status: 'archived' });
    await expect(reference.ownerRead(owner, moduleId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(sharing.sharedRead(guest, campaignId, moduleId, 'handout')).rejects.toMatchObject({ statusCode: 404 });
  });
  it('stores server-managed assets through the atomic draft update without exposing their keys', async () => {
    const updated = await attachments.saveAsset(admin, moduleId, 'handout', 1, { publicId: 'SECRET_STORAGE_KEY', resourceType: 'raw', format: 'pdf', contentType: 'application/pdf', bytes: 10 });
    expect(updated.revision).toBe(2);
    expect(JSON.stringify(adventureView(updated.toObject()))).not.toContain('SECRET_STORAGE_KEY');
    await expect(attachments.saveAsset(admin, moduleId, 'handout', 1, { publicId: 'stale', resourceType: 'raw', format: 'pdf', contentType: 'application/pdf', bytes: 10 }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
  it('keeps draft text, associations, title and assets hidden until an atomic publish updates prior owners and shared recipients', async () => {
    await sharing.share(owner, campaignId, moduleId, 'handout');
    const current = await access.load(moduleId);
    const updated = await authoring.update(admin, moduleId, { revision: 1, content: {
      title: 'DRAFT_TITLE', summary: 'DRAFT_SUMMARY', sections: current.sections.map(section => ({ ...section, storyText: 'DRAFT_SECTION', resourceIds: ['other'] })),
      resources: current.resources.map(resource => ({ ...resource, text: resource.id === 'handout' ? 'NEW_TEXT' : resource.text })),
      encounters: current.encounters,
    } });
    await attachments.saveAsset(admin, moduleId, 'handout', updated.revision, { publicId: 'NEW_ASSET', resourceType: 'raw', format: 'pdf', contentType: 'application/pdf', bytes: 10 });
    expect((await reference.ownerRead(owner, moduleId)).title).toBe('Adventure');
    expect((await reference.ownerRead(owner, moduleId)).sections[0].storyText).toBe('');
    expect((await reference.ownerRead(owner, moduleId)).sections[0].resourceIds).toEqual(['handout']);
    expect((await reference.list(owner))[0].title).toBe('Adventure');
    expect((await sharing.sharedRead(guest, campaignId, moduleId, 'handout')).text).toBe('Read aloud');
    expect((await sharing.sharedRead(guest, campaignId, moduleId, 'handout')).asset).toBeUndefined();
    await authoring.changeStatus(admin, moduleId, { revision: 3, status: 'published' });
    expect((await reference.ownerRead(owner, moduleId)).title).toBe('DRAFT_TITLE');
    expect((await reference.ownerRead(owner, moduleId)).sections[0].storyText).toBe('DRAFT_SECTION');
    expect((await reference.ownerRead(owner, moduleId)).sections[0].resourceIds).toEqual(['other']);
    expect((await reference.list(owner))[0].title).toBe('DRAFT_TITLE');
    expect((await sharing.sharedRead(guest, campaignId, moduleId, 'handout')).text).toBe('NEW_TEXT');
    expect((await sharing.sharedRead(guest, campaignId, moduleId, 'handout')).asset?.publicId).toBe('NEW_ASSET');
    expect(await RAG.countDocuments({ resourceId: libraryId })).toBe(1);
  });
  it('does not change an existing share when draft visibility changes, but withdraws it at publication', async () => {
    await sharing.share(owner, campaignId, moduleId, 'handout');
    const current = await access.load(moduleId);
    await authoring.update(admin, moduleId, { revision: 1, content: { title: current.title, sections: current.sections,
      resources: current.resources.map(resource => ({ ...resource, visibility: 'storyweaver' })), encounters: current.encounters } });
    expect((await sharing.sharedRead(guest, campaignId, moduleId, 'handout')).id).toBe('handout');
    await authoring.changeStatus(admin, moduleId, { revision: 2, status: 'published' });
    await expect(sharing.sharedRead(guest, campaignId, moduleId, 'handout')).rejects.toMatchObject({ statusCode: 404 });
    expect(await sharing.sharedList(guest, campaignId)).toEqual([]);
  });
});

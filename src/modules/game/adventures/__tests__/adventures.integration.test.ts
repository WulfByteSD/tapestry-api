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
import Setting from '../../content/model/SettingModel';
import Combatant from '../../content/model/CombatantModel';
import CombatantHandler from '../../content/handlers/Combatant.handler';
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
    await Promise.all([Adventure.deleteMany({}), AdventureShare.deleteMany({}), Player.deleteMany({}), Resource.deleteMany({}), RAG.deleteMany({}), Campaign.deleteMany({}), Combatant.deleteMany({}), Setting.deleteMany({})]);
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

  it('creates, validates, edits, archives and deletes referenced Unwoven without rewriting module content', async () => {
    const catalog = new CombatantHandler();
    await Setting.create({ key: 'test', name: 'Test setting' });
    const data = { key: 'sentry', name: 'Sentry', settingKeys: ['test'], status: 'published',
      statline: { hp: 12, defenseTN: 10, harm: 'Light (3)', armor: 1, actions: 1 },
      attacks: [{ name: 'Strike', harm: 'Light (3)', range: 'Melee', notes: 'Test attack' }],
      abilities: [{ name: 'Stand fast', text: 'Holds the line', cooldown: 'Once per scene' }] };
    await expect(catalog.create({ ...data, statline: { ...data.statline, hp: 0 } })).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(catalog.create({ ...data, settingKeys: ['missing'] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(catalog.create({ ...data, loreNodeId: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ statusCode: 400 });
    const first = await catalog.create({ ...data, origins: ['Revenant', 'Construct'], origin: 'Revenant / Construct' });
    const second = await catalog.create({ ...data, key: 'scout', name: 'Scout' });
    const firstId = String(first._id), secondId = String(second._id);
    await expect(catalog.update(firstId, { statline: { ...data.statline, hp: 0 } })).rejects.toMatchObject({ name: 'ValidationError' });
    await catalog.update(firstId, { name: 'Veteran sentry', statline: { ...data.statline, hp: 18 } });
    expect((await catalog.fetch(firstId)).statline.hp).toBe(18);
    expect((await catalog.fetch(firstId)).origins).toEqual(['Revenant', 'Construct']);
    await Setting.deleteMany({ key: 'test' });
    await catalog.update(firstId, { settingKeys: ['test'], name: 'Retained legacy setting' });
    await expect(catalog.update(firstId, { settingKeys: ['test', 'another-missing'] })).rejects.toMatchObject({ statusCode: 400 });
    expect((await catalog.fetch(firstId)).abilities[0].text).toBe('Holds the line');
    const current = await access.load(moduleId);
    const content = { title: current.title, sections: current.sections.map(section => ({ ...section, encounterIds: ['watch'] })), resources: current.resources,
      encounters: [{ id: 'watch', title: 'The watch', notes: 'A recommendation', combatants: [{ combatantId: firstId, quantity: 2 }, { combatantId: secondId, quantity: 1 }] }] };
    await authoring.update(admin, moduleId, { revision: 1, content });
    await authoring.changeStatus(admin, moduleId, { revision: 2, status: 'published' });
    const stored = JSON.stringify(await Adventure.findById(moduleId).lean());
    await catalog.update(firstId, { status: 'archived' });
    expect((await reference.ownerRead(owner, moduleId)).encounters[0].combatants).toEqual([{ combatantId: secondId, quantity: 1 }]);
    await catalog.update(firstId, { status: 'published' });
    expect((await reference.ownerRead(owner, moduleId)).encounters[0].combatants).toHaveLength(2);
    await catalog.delete(firstId);
    const section = await reference.section(owner, moduleId, 'a');
    expect(section.encounters[0].combatants).toEqual([{ combatantId: secondId, quantity: 1 }]);
    expect(section.resources.map(resource => resource.id)).toEqual(['handout']);
    await catalog.delete(secondId);
    expect((await reference.ownerRead(owner, moduleId)).encounters[0].combatants).toEqual([]);
    expect(JSON.stringify(await Adventure.findById(moduleId).lean())).toBe(stored);
    await expect(catalog.update(firstId, { name: 'Already removed' })).rejects.toMatchObject({ statusCode: 404 });
    // Subsequent unrelated authoring still succeeds without removing stored references.
    await authoring.update(admin, moduleId, { revision: 3, content: { ...content, title: 'Revised story' } });
    await authoring.changeStatus(admin, moduleId, { revision: 4, status: 'published' });
    expect((await reference.ownerRead(owner, moduleId)).encounters[0].combatants).toEqual([]);
  });
  it('roundtrips marked rich strings and legacy literal text through authoring, publication and shared reads', async () => {
    const rich = '<!--tapestry:richtext:v1--><p><strong>Read aloud</strong></p><ul><li>Clue</li></ul>';
    const plain = 'Literal <b>text</b> stays plain.';
    const current = await access.load(moduleId);
    const content = { title: current.title, summary: plain,
      sections: current.sections.map(section => ({ ...section, storyText: rich, storyweaverNotes: rich, context: plain })),
      resources: current.resources.map(resource => ({ ...resource, text: rich })), encounters: [] };
    await authoring.update(admin, moduleId, { revision: 1, content });
    expect((await access.load(moduleId)).sections[0].storyText).toBe(rich);
    await authoring.changeStatus(admin, moduleId, { revision: 2, status: 'published' });
    const published = await reference.ownerRead(owner, moduleId);
    expect(published.summary).toBe(plain); expect(published.sections[0].storyText).toBe(rich);
    await sharing.share(owner, campaignId, moduleId, 'handout');
    expect((await sharing.sharedRead(guest, campaignId, moduleId, 'handout')).text).toBe(rich);
    const catalog = new CombatantHandler();
    const record = await catalog.create({ key: 'rich-sentry', name: 'Sentry', statline: { hp: 12, defenseTN: 10, harm: 'Legacy notation' },
      backgroundBehavior: plain, notes: { gm: rich }, abilities: [{ name: 'Stand', text: rich }] });
    const saved = await catalog.fetch(String(record._id));
    expect(saved.backgroundBehavior).toBe(plain); expect(saved.notes.gm).toBe(rich); expect(saved.abilities[0].text).toBe(rich);
    expect(saved.statline.harm).toBe('Legacy notation');
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

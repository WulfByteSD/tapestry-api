import mongoose from 'mongoose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { testRuntime, config, base } from '../../test/fixtures';
import { contentModels } from '../../util/contentRegistry';
import { prepare } from '../ContentValidation.handler';
import { ContentReadHandler } from '../ContentRead.handler';
import { ContentProposalHandler } from '../ContentProposal.handler';
import { McpGrant } from '../../model/McpGrant';
import { McpAudit } from '../../model/McpAudit';
import { McpOperation } from '../../model/McpOperation';
import { McpProposal } from '../../model/McpProposal';
import { revision } from '../../util/mcpCredentials';
import { Operation } from '../../types/McpTypes';
import { loadActor } from '../McpAccess.handler';
import { ContentWriteHandler } from '../ContentWrite.handler';

jest.setTimeout(120000);
let runtime: Awaited<ReturnType<typeof testRuntime>>;
const reads = new ContentReadHandler();
const item = (key: string, data: Record<string, any> = {}): Operation => ({ type: 'items', action: 'create', data: { key, name: key, category: 'gear', settingKeys: ['alpha'], ...data } });
beforeAll(async () => { runtime = await testRuntime(); });
beforeEach(async () => { await runtime.reset(); });
afterAll(async () => { if (runtime) await runtime.close(); });

test('official machine MCP client connects, lists scoped tools, reads context, creates and reads content', async () => {
  const token = await runtime.machineToken();
  const client = new Client({ name: 'machine-smoke', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(runtime.url + base), { requestInit: { headers: { Authorization: `Bearer ${token}`, Host: 'api.example.test' } } }));
    expect((await client.listTools()).tools.map(t => t.name)).toEqual(expect.arrayContaining(['content_context', 'content_create', 'content_bulk']));
    const context = await client.callTool({ name: 'content_context', arguments: {} });
    expect(context.isError).not.toBe(true);
    expect((context.structuredContent as any).policy.canonVerified).toBe(false);
    const created = await client.callTool({ name: 'content_create', arguments: { operationId: 'smoke-create', operation: item('smoke') } });
    expect(created.isError).not.toBe(true);
    expect((created.structuredContent as any).status).toBe('draft');
    const read = await client.callTool({ name: 'content_get', arguments: { type: 'items', id: (created.structuredContent as any).id } });
    expect((read.structuredContent as any).record.key).toBe('smoke');
    expect((await client.readResource({ uri: 'tapestry://content/context' })).contents).toHaveLength(1);
  } finally { await client.close(); }
});

test('proposal-only clients do not discover direct write tools and cannot invoke writes', async () => {
  await runtime.restrict(['read', 'propose']);
  const token = await runtime.machineToken('read propose');
  const client = new Client({ name: 'restricted', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(runtime.url + base), { requestInit: { headers: { Authorization: `Bearer ${token}`, Host: 'api.example.test' } } }));
    const names = (await client.listTools()).tools.map(t => t.name);
    expect(names).toContain('content_propose'); expect(names).not.toContain('content_create');
    await expect(runtime.writes.mutate(await runtime.actor(), 'unauthorized', item('denied'), 'direct')).rejects.toMatchObject({ code: 'forbidden' });
    expect(await contentModels.items.countDocuments()).toBe(0);
  } finally { await client.close(); }
});

test('all attached settings must be granted, and drafts/shared/archived content require explicit permission', async () => {
  await contentModels.skills.create([{ key: 'allowed', name: 'Allowed', settingKeys: ['alpha'], status: 'published' },
    { key: 'mixed', name: 'Mixed', settingKeys: ['alpha', 'beta'], status: 'published' }, { key: 'shared', name: 'Shared', settingKeys: [], status: 'published' },
    { key: 'draft', name: 'Draft', settingKeys: ['alpha'], status: 'draft' }, { key: 'archived', name: 'Archived', settingKeys: ['alpha'], status: 'archived' }]);
  await runtime.restrict(['read', 'propose']);
  expect((await reads.search(await runtime.actor(), { type: 'skills' })).records.map(r => r.record.key)).toEqual(['allowed']);
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { shared: true, capabilities: ['read', 'read:draft', 'read:archived'] } });
  expect((await reads.search(await runtime.actor(), { type: 'skills' })).records.map(r => r.record.key)).toEqual(['allowed', 'shared', 'draft', 'archived']);
});

test('direct creates default to draft; publishing and editing published content need publish', async () => {
  await runtime.restrict(['read', 'create', 'update', 'read:draft']);
  const actor = await runtime.actor();
  const created = await runtime.writes.mutate(actor, 'draft', item('draft'), 'direct');
  expect(created.status).toBe('draft');
  await expect(runtime.writes.mutate(actor, 'publish', item('pub', { status: 'published' }), 'direct')).rejects.toMatchObject({ code: 'forbidden' });
  const published = await contentModels.items.create({ key: 'existing', name: 'Existing', category: 'gear', settingKeys: ['alpha'], status: 'published' });
  const before = await contentModels.items.findById(published._id).lean();
  await expect(runtime.writes.mutate(actor, 'editpub', { type: 'items', action: 'update', id: String(published._id), revision: revision(before), data: { notes: 'Changed' } }, 'direct')).rejects.toMatchObject({ code: 'forbidden' });
});

test('setting membership changes check both the current and resulting content', async () => {
  const actor = await runtime.actor();
  const created = await runtime.writes.mutate(actor, 'initial', item('membership'), 'direct');
  await expect(runtime.writes.mutate(actor, 'move', { type: 'items', action: 'update', id: created.id, revision: created.revision, data: { settingKeys: ['beta'] } }, 'direct')).rejects.toMatchObject({ code: 'forbidden' });
  const outside = await contentModels.items.create({ key: 'outside', name: 'Outside', category: 'gear', settingKeys: ['beta'], status: 'published' });
  await expect(prepare(actor, { type: 'items', action: 'update', id: String(outside._id), revision: revision(outside.toObject()), data: { settingKeys: ['alpha'] } })).rejects.toMatchObject({ code: 'forbidden' });
});

test('unknown fields, MongoDB operators, key renaming, computed fields, and archive writes are rejected', async () => {
  const actor = await runtime.actor();
  for (const data of [{ $set: { name: 'bad' } }, { 'meta.name': 'bad' }, { madeUp: 1 }, { status: 'archived' }, { _id: String(new mongoose.Types.ObjectId()) }])
    await expect(prepare(actor, item('bad', data))).rejects.toBeDefined();
  const created = await runtime.writes.mutate(actor, 'created', item('unchanged'), 'direct');
  await expect(prepare(actor, { type: 'items', action: 'update', id: created.id, revision: created.revision, data: { key: 'renamed' } })).rejects.toBeDefined();
  await expect(prepare(actor, { type: 'lore', action: 'create', data: { key: 'bad', name: 'Bad', settingKey: 'alpha', depth: 100 } })).rejects.toBeDefined();
});

test('relationships to unreadable content are filtered out of reads and forbidden in new writes', async () => {
  const hidden = await contentModels.abilities.create({ key: 'hidden', name: 'Hidden', settingKeys: ['beta'], status: 'published' });
  const target = await contentModels.items.create({ key: 'visible', name: 'Visible', category: 'gear', settingKeys: ['alpha'], status: 'published', grantedAbilities: [{ abilityId: hidden._id, abilityKey: 'hidden' }] });
  const actor = await runtime.actor();
  expect((await reads.get(actor, { type: 'items', id: String(target._id) })).record.grantedAbilities).toEqual([]);
  await expect(prepare(actor, item('new', { grantedAbilities: [{ abilityId: String(hidden._id), abilityKey: 'hidden' }] }))).rejects.toMatchObject({ code: 'validation' });
});

test('proposal-only authors can suggest published changes; human approval applies exactly the reviewed operation', async () => {
  await runtime.restrict(['read', 'propose']);
  const actor = await runtime.actor();
  const proposed = await runtime.writes.mutate(actor, 'propose', item('proposed', { status: 'published' }), 'proposal', 'A new piece of gear.');
  expect(await contentModels.items.countDocuments()).toBe(0);
  const result = await runtime.request(`${base}/admin/proposals/${proposed.proposalId}/approve`, 'POST', { operationId: 'approve', note: 'Reviewed.' }, { Authorization: `Bearer ${runtime.adminToken}` });
  expect(result.response.status).toBe(200); expect(result.data.payload.state).toBe('applied');
  expect((await contentModels.items.findOne({ key: 'proposed' }).lean()).status).toBe('published');
  expect((await new ContentProposalHandler().proposalGet(await runtime.actor(), proposed.proposalId)).state).toBe('applied');
  expect(await McpAudit.countDocuments({ event: 'proposal_approve' })).toBe(1);
});

test('stale or revoked proposals remain pending without changing live content', async () => {
  const created = await runtime.writes.mutate(await runtime.actor(), 'create', item('existing'), 'direct');
  const operation: Operation = { type: 'items', action: 'update', id: created.id, revision: created.revision, data: { notes: 'Proposal' } };
  const proposed = await runtime.writes.mutate(await runtime.actor(), 'propose', operation, 'proposal', 'Improvement.');
  await runtime.writes.mutate(await runtime.actor(), 'other', { ...operation, data: { notes: 'Concurrent change' } }, 'direct');
  await expect(runtime.admin.review(runtime.adminId, 'approve-stale', proposed.proposalId, 'approve', '')).rejects.toMatchObject({ code: 'conflict' });
  expect((await McpProposal.findById(proposed.proposalId).lean()).state).toBe('pending');
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { isActive: false } });
  await expect(runtime.admin.review(runtime.adminId, 'approve-revoked', proposed.proposalId, 'approve', '')).rejects.toMatchObject({ code: 'invalid_token' });
});

test('agents cannot approve proposals, and proposals are restricted to their author connection', async () => {
  const proposed = await runtime.writes.mutate(await runtime.actor(), 'propose', item('private'), 'proposal', 'Private proposal.');
  const token = await runtime.machineToken();
  expect((await runtime.request(`${base}/admin/proposals/${proposed.proposalId}/approve`, 'POST', { operationId: 'agent-approve' }, { Authorization: `Bearer ${token}` })).response.status).toBe(401);
  const other = { ...await runtime.actor(), grantId: String(new mongoose.Types.ObjectId()) };
  await expect(new ContentProposalHandler().proposalGet(other, proposed.proposalId)).rejects.toMatchObject({ code: 'not_found' });
});

test('bulk dry runs write nothing, mixed batches report each outcome, and retries cannot duplicate writes', async () => {
  const actor = await runtime.actor();
  const entries = [{ operationId: 'one', operation: item('one') }, { operationId: 'invalid', operation: item('invalid', { settingKeys: ['beta'] }) }, { operationId: 'two', operation: item('two') }];
  expect((await runtime.writes.bulk(actor, entries, 'direct', true)).results.map(r => r.valid)).toEqual([true, false, true]);
  expect(await contentModels.items.countDocuments()).toBe(0);
  const results = await runtime.writes.bulk(actor, entries, 'direct');
  expect(results.results.map(r => r.valid)).toEqual([true, false, true]);
  await runtime.writes.bulk(actor, entries, 'direct');
  expect(await contentModels.items.countDocuments()).toBe(2);
  expect(await McpOperation.countDocuments({ actorKey: `grant:${runtime.grantId}` })).toBe(2);
  await expect(runtime.writes.mutate(actor, 'one', item('different'), 'direct')).rejects.toMatchObject({ code: 'conflict' });
});

test('independent handlers/workers return one durable result for concurrent identical operation IDs', async () => {
  const actor = await runtime.actor();
  const results = await Promise.all([runtime.writes.mutate(actor, 'same', item('same'), 'direct'), new ContentWriteHandler().mutate(actor, 'same', item('same'), 'direct')]);
  expect(results[0]).toEqual(results[1]);
  expect(await contentModels.items.countDocuments()).toBe(1);
});

test('concurrent updates from one revision yield one success and one conflict', async () => {
  const actor = await runtime.actor();
  const created = await runtime.writes.mutate(actor, 'create', item('concurrent'), 'direct');
  const op: Operation = { type: 'items', action: 'update', id: created.id, revision: created.revision, data: { notes: 'First' } };
  const results = await Promise.allSettled([runtime.writes.mutate(actor, 'first', op, 'direct'), runtime.writes.mutate(actor, 'second', { ...op, data: { notes: 'Second' } }, 'direct')]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('conflict');
});

test('lore patches preserve the parent; moves rebuild descendants, reject cycles, and roll back on audit failure', async () => {
  const actor = await runtime.actor();
  const lore = async (key: string, parentId?: string) => runtime.writes.mutate(actor, `create-${key}`, { type: 'lore', action: 'create', data: { key, name: key, settingKey: 'alpha', parentId } }, 'direct');
  const root = await lore('root'), child = await lore('child', root.id), grandchild = await lore('grandchild', child.id), other = await lore('other');
  const childDoc = await contentModels.lore.findById(child.id).lean();
  const patched = await runtime.writes.mutate(actor, 'patch', { type: 'lore', action: 'update', id: child.id, revision: revision(childDoc), data: { summary: 'Keep parent' } }, 'direct');
  expect(String((await contentModels.lore.findById(child.id).lean()).parentId)).toBe(root.id);
  await expect(prepare(actor, { type: 'lore', action: 'update', id: root.id, revision: root.revision, data: { parentId: grandchild.id } })).rejects.toBeDefined();
  const originalAuditCreate = McpAudit.create.bind(McpAudit);
  const mock = jest.spyOn(McpAudit, 'create').mockImplementation((...args: any[]) => {
    if (args[0]?.[0]?.event === 'hierarchy_updated') return Promise.reject(new Error('Injected audit outage')) as any;
    return (originalAuditCreate as any)(...args);
  });
  try { await expect(runtime.writes.mutate(actor, 'move-failed', { type: 'lore', action: 'update', id: child.id, revision: patched.revision, data: { parentId: other.id } }, 'direct')).rejects.toBeDefined(); }
  finally { mock.mockRestore(); }
  expect(String((await contentModels.lore.findById(child.id).lean()).parentId)).toBe(root.id);
  expect((await contentModels.lore.findById(grandchild.id).lean()).ancestorIds.map(String)).toEqual([root.id, child.id]);
  expect(await McpOperation.countDocuments({ operationId: 'move-failed' })).toBe(0);
  await runtime.writes.mutate(actor, 'move-success', { type: 'lore', action: 'update', id: child.id, revision: patched.revision, data: { parentId: other.id } }, 'direct');
  expect((await contentModels.lore.findById(grandchild.id).lean()).ancestorIds.map(String)).toEqual([other.id, child.id]);
});

test('lore moves from different grants cannot concurrently create a parent cycle', async () => {
  const actor = await runtime.actor();
  const a = await runtime.writes.mutate(actor, 'a', { type: 'lore', action: 'create', data: { key: 'a', name: 'A', settingKey: 'alpha' } }, 'direct');
  const b = await runtime.writes.mutate(actor, 'b', { type: 'lore', action: 'create', data: { key: 'b', name: 'B', settingKey: 'alpha' } }, 'direct');
  await runtime.admin.createClient(runtime.adminId, 'second-client', { clientId: 'second', name: 'Second', kind: 'machine', confidential: true, redirectUris: [] });
  const grant = await runtime.admin.createGrant(runtime.adminId, 'second-grant', { clientId: 'second', ownerId: runtime.ownerId, capabilities: actor.capabilities, contentTypes: actor.contentTypes, settingKeys: ['alpha'], shared: false, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const other = await loadActor(String(grant._id), 'second');
  const results = await Promise.allSettled([runtime.writes.mutate(actor, 'move-a', { type: 'lore', action: 'update', id: a.id, revision: a.revision, data: { parentId: b.id } }, 'direct'),
    runtime.writes.mutate(other, 'move-b', { type: 'lore', action: 'update', id: b.id, revision: b.revision, data: { parentId: a.id } }, 'direct')]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
});

test('all six content types use native defaults/enums and object patches preserve untouched nested fields', async () => {
  await McpGrant.updateOne({ _id: runtime.grantId }, { $addToSet: { settingKeys: 'gamma' } });
  const actor = await runtime.actor();
  const operations: Operation[] = [item('item'),
    { type: 'skills', action: 'create', data: { key: ' SKILL ', name: 'Skill', settingKeys: ['alpha'], category: 'technical' } },
    { type: 'abilities', action: 'create', data: { key: ' ABILITY ', name: 'Ability', settingKeys: ['alpha'], cost: { resourceKey: 'threads', amount: 2 } } },
    { type: 'settings', action: 'create', data: { key: 'gamma', name: 'Gamma', modules: { items: true, lore: true } } },
    { type: 'lore', action: 'create', data: { key: ' LORE ', name: 'Lore', settingKey: 'alpha' } },
    { type: 'combatants', action: 'create', data: { key: ' COMBATANT ', name: 'Combatant', settingKeys: ['alpha'], statline: { hp: 10, defenseTN: 10, harm: 'Light (2)' } } }];
  for (const [index, operation] of operations.entries()) {
    const created = await runtime.writes.mutate(actor, `type-${index}`, operation, 'direct');
    expect(created.status).toBe('draft');
    const record = await reads.get(actor, { type: operation.type, id: created.id });
    if (['skills', 'abilities', 'lore', 'combatants'].includes(operation.type)) expect(record.record.key).toBe(operation.type === 'abilities' ? 'ability' : operation.type === 'skills' ? 'skill' : operation.type === 'combatants' ? 'combatant' : 'lore');
    if (operation.type === 'combatants') {
      await runtime.writes.mutate(actor, 'partial-statline', { type: 'combatants', action: 'update', id: created.id, revision: record.revision, data: { statline: { hp: 20 } } }, 'direct');
      expect((await reads.get(actor, { type: 'combatants', id: created.id })).record.statline).toMatchObject({ hp: 20, defenseTN: 10, harm: 'Light (2)' });
    }
    if (operation.type === 'abilities') {
      await runtime.writes.mutate(actor, 'partial-cost', { type: 'abilities', action: 'update', id: created.id, revision: record.revision, data: { cost: { amount: 3 } } }, 'direct');
      expect((await reads.get(actor, { type: 'abilities', id: created.id })).record.cost).toMatchObject({ resourceKey: 'threads', amount: 3 });
    }
  }
  await expect(prepare(actor, { type: 'combatants', action: 'create', data: { key: 'invalid', name: 'Invalid', settingKeys: ['alpha'], statline: { hp: 0, defenseTN: 10, harm: 'Light' } } })).rejects.toBeDefined();
});

test('recorded retries, proposals and related references respect reduced grants', async () => {
  const actor = await runtime.actor();
  const created = await runtime.writes.mutate(actor, 'original', item('original'), 'direct');
  const dependent = await contentModels.abilities.create({ key: 'dependent', name: 'Dependent', settingKeys: ['alpha'], status: 'published' });
  const proposed = await runtime.writes.mutate(actor, 'proposal', item('proposed', { grantedAbilities: [{ abilityId: String(dependent._id), abilityKey: 'dependent' }] }), 'proposal', 'Reviewed relationship.');
  await McpGrant.updateOne({ _id: runtime.grantId }, { $pull: { contentTypes: 'abilities' } });
  expect((await new ContentProposalHandler().proposalGet(await runtime.actor(), proposed.proposalId)).operation.data.grantedAbilities).toEqual([]);
  await runtime.restrict(['read', 'propose', 'bulk']);
  await expect(runtime.writes.mutate(actor, 'original', item('original'), 'direct')).rejects.toMatchObject({ code: 'forbidden' });
  const dryRun = await runtime.writes.bulk(await runtime.actor(), [{ operationId: 'original', operation: item('changed') }], 'direct', true);
  expect(dryRun.results[0].error.code).toBe('conflict');
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { settingKeys: ['beta'] } });
  await expect(new ContentProposalHandler().proposalGet(await runtime.actor(), proposed.proposalId)).rejects.toMatchObject({ code: 'forbidden' });
  expect(await contentModels.items.findById(created.id)).toBeDefined();
});

test('shared proposals keep shared permission even when an update moves them into an allowed setting', async () => {
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { shared: true } });
  const actor = await runtime.actor();
  const shared = await contentModels.skills.create({ key: 'shared', name: 'Shared', settingKeys: [], status: 'published' });
  const proposed = await runtime.writes.mutate(actor, 'shared-proposal', { type: 'skills', action: 'update', id: String(shared._id), revision: revision(shared.toObject()), data: { settingKeys: ['alpha'] } }, 'proposal', 'Make this setting specific.');
  expect((await new ContentProposalHandler().proposalGet(actor, proposed.proposalId)).requiresShared).toBe(true);
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { shared: false } });
  await expect(new ContentProposalHandler().proposalGet(await runtime.actor(), proposed.proposalId)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(runtime.writes.mutate(actor, 'shared-proposal', { type: 'skills', action: 'update', id: String(shared._id), revision: revision(shared.toObject()), data: { settingKeys: ['alpha'] } }, 'proposal', 'Make this setting specific.')).rejects.toMatchObject({ code: 'forbidden' });
});

test('bulk references must preexist, duplicate keys/IDs are explicit, and lore helper failures roll back all side effects', async () => {
  const actor = await runtime.actor();
  const batch = [{ operationId: 'skill', operation: { type: 'skills', action: 'create', data: { key: 'new-skill', name: 'New skill', settingKeys: ['alpha'] } } as Operation },
    { operationId: 'dependent', operation: item('dependent', { attackProfiles: [{ key: 'attack', name: 'Attack', allowedSkillKeys: ['new-skill'] }] }) }];
  expect((await runtime.writes.bulk(actor, batch, 'direct')).results.map(r => r.valid)).toEqual([true, false]);
  expect((await runtime.writes.bulk(actor, [{ operationId: 'duplicate', operation: item('one') }, { operationId: 'duplicate', operation: item('two') }], 'direct', true)).results.map(r => r.valid)).toEqual([true, false]);
  await expect(runtime.writes.mutate(actor, 'same-key', { type: 'skills', action: 'create', data: { key: 'new-skill', name: 'Another', settingKeys: ['alpha'] } }, 'direct')).rejects.toMatchObject({ code: 'duplicate' });
  const root = await runtime.writes.mutate(actor, 'root', { type: 'lore', action: 'create', data: { key: 'root', name: 'Root', settingKey: 'alpha' } }, 'direct');
  const child = await runtime.writes.mutate(actor, 'child', { type: 'lore', action: 'create', data: { key: 'child', name: 'Child', settingKey: 'alpha', parentId: root.id } }, 'direct');
  const hierarchy = (await import('../../../service/LoreHierarchyService')).default;
  const rebuild = jest.spyOn(hierarchy, 'rebuildDescendantHierarchy').mockRejectedValueOnce(new Error('Injected hierarchy outage'));
  try { await expect(runtime.writes.mutate(actor, 'failed-move', { type: 'lore', action: 'update', id: child.id, revision: child.revision, data: { parentId: null } }, 'direct')).rejects.toBeDefined(); }
  finally { rebuild.mockRestore(); }
  expect(String((await contentModels.lore.findById(child.id).lean()).parentId)).toBe(root.id);
  expect(await McpOperation.countDocuments({ operationId: 'failed-move' })).toBe(0);
});

test('item key generation and shared authoring scope survive proposal approval without losing access boundaries', async () => {
  const actor = await runtime.actor();
  const generated = await runtime.writes.mutate(actor, 'generated', { type: 'items', action: 'create', data: { name: 'Travel Rope', category: 'gear', settingKeys: ['alpha'] } }, 'direct');
  expect((await reads.get(actor, { type: 'items', id: generated.id })).record.key).toBe('alpha:travel-rope');
  await expect(runtime.writes.mutate(actor, 'shared-denied', item('shared', { scope: 'shared' }), 'direct')).rejects.toMatchObject({ code: 'forbidden' });
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { shared: true, settingKeys: ['alpha', 'beta'] } });
  const authorized = await runtime.actor();
  const proposed = await runtime.writes.mutate(authorized, 'shared-propose', { type: 'items', action: 'create', data: { name: 'Shared Rope', category: 'gear', scope: 'shared', settingKeys: ['alpha', 'beta'] } }, 'proposal', 'A shared item for both settings.');
  const reviewed = await runtime.admin.review(runtime.adminId, 'shared-approve', proposed.proposalId, 'approve', 'Reviewed');
  const record = await reads.get(authorized, { type: 'items', id: reviewed.result.id });
  expect(record.record.key).toBe('shared-rope');
  expect(record.record.settingKeys).toEqual(['alpha', 'beta', 'shared']);
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { shared: false } });
  await expect(reads.get(await runtime.actor(), { type: 'items', id: reviewed.result.id })).rejects.toMatchObject({ code: 'not_found' });
});

test('reference validation cannot use unreadable settings to bypass content-type or draft boundaries', async () => {
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { contentTypes: ['items'] } });
  await expect(prepare(await runtime.actor(), item('no-setting-access'))).rejects.toMatchObject({ code: 'validation' });
  await McpGrant.updateOne({ _id: runtime.grantId }, { $set: { contentTypes: ['items', 'settings'], capabilities: ['read', 'create'] } });
  await contentModels.settings.updateOne({ key: 'alpha' }, { $set: { status: 'draft' } });
  await expect(prepare(await runtime.actor(), item('draft-setting'))).rejects.toMatchObject({ code: 'validation' });
});

test('tool and resource failures return safe errors and persist denials without exposing storage diagnostics', async () => {
  const token = await runtime.machineToken();
  const client = new Client({ name: 'safe-errors', version: '1.0.0' });
  const mock = jest.spyOn(ContentReadHandler.prototype, 'context').mockRejectedValue(new Error('sensitive-storage-detail'));
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(runtime.url + base), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const result = await client.callTool({ name: 'content_context', arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.structuredContent as any).error.code).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('sensitive-storage-detail');
    await expect(client.readResource({ uri: 'tapestry://content/context' })).rejects.toThrow('The operation could not be completed.');
    expect(await McpAudit.countDocuments({ event: 'resource_denied' })).toBe(1);
  } finally { mock.mockRestore(); await client.close(); }
});

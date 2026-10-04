import { ClientSession } from 'mongoose';
import { z } from 'zod';
import LoreModel from '../../model/LoreNodeModel';
import loreHierarchy from '../../service/LoreHierarchyService';
import { Actor, Operation } from '../types/McpTypes';
import { McpError, failure } from '../util/McpError';
import { requireCapability, assertAccess } from '../util/mcpPolicy';
import { revision, digest, stable } from '../util/mcpCredentials';
import { contentModels } from '../util/contentRegistry';
import { operationIdSchema } from '../util/contentContracts';
import { McpOperation } from '../model/McpOperation';
import { McpProposal } from '../model/McpProposal';
import { loadActor, touchActor } from './McpAccess.handler';
import { audit } from './McpAudit.handler';
import { once } from './McpOperation.handler';
import { prepare } from './ContentValidation.handler';
import { recordSettings } from '../util/mcpPolicy';
import { McpLock } from '../model/McpLock';
import { McpAudit } from '../model/McpAudit';

export class ContentWriteHandler {
  constructor(private chargeWrite: (actor: Actor) => Promise<void> = async () => {}) {}
  /** Human approvals use the same per-grant write budget as direct agent operations. */
  async chargeApproval(actor: Actor) { await this.chargeWrite(actor); }
  /** Apply one direct mutation or store one proposal atomically with its audit and retry result. */
  async mutate(actor: Actor, operationId: string, operation: Operation, mode: 'direct' | 'proposal', rationale = ''): Promise<any> {
    actor = await loadActor(actor.grantId, actor.clientId, actor.ceiling);
    operationIdSchema.parse(operationId);
    const payload = { operation, mode, rationale };
    // Do not revalidate an already-applied update against its old revision on an identical retry.
    const saved = await McpOperation.findOne({ actorKey: `grant:${actor.grantId}`, operationId }).lean();
    if (saved) {
      if (saved.payloadHash !== digest(stable(payload))) throw new McpError('conflict', 'This operation ID was already used for a different payload.', 409);
      await this.authorizeRetry(actor, operationId, operation, mode);
    }
    if (!saved) await this.chargeWrite(actor);
    return once(`grant:${actor.grantId}`, operationId, payload, async (session) => {
      const current = await touchActor(actor, session);
      await this.lockLore(operation, session);
      const prepared = await prepare(current, operation, mode === 'proposal', session);
      if (mode === 'proposal') {
        z.string().min(1).max(10000).parse(rationale);
        const [proposal] = await McpProposal.create(
          [{ grantId: current.grantId, clientId: current.clientId, ownerId: current.ownerId, operation: prepared.operation, rationale,
            settingKeys: [...new Set([...recordSettings(operation.type, prepared.after), ...(prepared.before ? recordSettings(operation.type, prepared.before) : [])])],
            requiresShared: [prepared.after, ...(prepared.before ? [prepared.before] : [])].some(doc => !recordSettings(operation.type, doc).length || recordSettings(operation.type, doc).includes('shared')) }],
          { session }
        );
        const result = { proposalId: String(proposal._id), state: 'pending' };
        await audit(current, 'proposed', { operationId, target: String(proposal._id) }, session);
        return result;
      }
      return this.apply(current, prepared, operationId, session);
    });
  }
  /** Recheck historical boundaries and current capabilities before returning a previously committed outcome. */
  private async authorizeRetry(actor: Actor, operationId: string, operation: Operation, mode: 'direct' | 'proposal') {
    requireCapability(actor, 'read', mode === 'proposal' ? 'propose' : operation.action);
    if (mode === 'proposal') {
      const proposal = await McpProposal.findOne({ grantId: actor.grantId, clientId: actor.clientId,
        _id: (await McpOperation.findOne({ actorKey: `grant:${actor.grantId}`, operationId }).lean())?.result?.proposalId }).lean();
      if (!proposal || !actor.contentTypes.includes(proposal.operation.type) || (proposal.requiresShared && !actor.shared) ||
        (proposal.settingKeys.length ? proposal.settingKeys.some((key: string) => key === 'shared' ? !actor.shared : !actor.settingKeys.includes(key)) : !actor.shared))
        throw new McpError('forbidden', 'This proposal is outside the current grant.', 403);
      return;
    }
    const saved = await McpOperation.findOne({ actorKey: `grant:${actor.grantId}`, operationId }).lean();
    const applied = (await McpAudit.find({ actorKey: `grant:${actor.grantId}`, operationId, event: 'applied', target: `${operation.type}:${saved?.result?.id}` }).lean())
      .find(event => revision(event.after) === saved?.result?.revision);
    if (!applied) throw new McpError('forbidden', 'The recorded operation cannot be authorized.', 403);
    if (applied.before) assertAccess(actor, operation.type, applied.before);
    assertAccess(actor, operation.type, applied.after, false);
    if (applied.before?.status === 'published' || applied.after?.status === 'published') requireCapability(actor, 'publish');
  }
  /** Serialize lore parent changes within a setting, including operations submitted by different clients. */
  async lockLore(operation: Operation, session: ClientSession) {
    if (operation.type !== 'lore') return;
    const node = operation.id ? await LoreModel.findById(operation.id).select('settingKey').session(session).lean() : null;
    const key = operation.data.settingKey || node?.settingKey;
    if (key) await McpLock.updateOne({ key: `lore:${key}` }, { $inc: { useCount: 1 } }, { upsert: true, session });
  }
  /** Write validated content and all lore hierarchy side effects inside the caller's transaction. */
  async apply(actor: Actor, prepared: Awaited<ReturnType<typeof prepare>>, operationId: string, session: ClientSession): Promise<any> {
    const { operation, before, after } = prepared;
    const Model = contentModels[operation.type];
    let doc: any;
    let descendants: any[] = [];
    const movesLore = operation.type === 'lore' && before && String(before.parentId || '') !== String(after.parentId || '');
    if (movesLore) {
      descendants = await LoreModel.find({ ancestorIds: before._id, status: { $ne: 'archived' } })
        .session(session)
        .lean();
      for (const child of descendants) {
        assertAccess(actor, 'lore', child, false);
        if (child.status === 'published') requireCapability(actor, 'publish');
      }
    }
    if (!before) [doc] = await Model.create([after], { session });
    else {
      const filter = { _id: before._id, updatedAt: before.updatedAt, __v: before.__v ?? { $exists: false } };
      const updated = { ...after, __v: (before.__v || 0) + 1, updatedAt: new Date() };
      doc = await Model.findOneAndReplace(filter, updated, { session, returnDocument: 'after', runValidators: true });
      if (!doc) throw new McpError('conflict', 'Content changed during this operation.', 409);
    }
    if (movesLore) {
      await loreHierarchy.rebuildDescendantHierarchy(String(doc._id), session);
      for (const child of descendants)
        await audit(
          actor,
          'hierarchy_updated',
          { operationId, target: `lore:${child._id}`, before: child, after: await LoreModel.findById(child._id).session(session).lean() },
          session
        );
    }
    const result = { id: String(doc._id), type: operation.type, status: doc.status, revision: revision(doc.toObject()) };
    await audit(actor, 'applied', { operationId, target: `${operation.type}:${doc._id}`, before, after: doc.toObject() }, session);
    return result;
  }
  /** Validate every entry before applying independent valid operations; report each failure explicitly. */
  async bulk(actor: Actor, entries: Array<{ operationId: string; operation: Operation; rationale?: string }>, mode: 'direct' | 'proposal', dryRun = false) {
    actor = await loadActor(actor.grantId, actor.clientId, actor.ceiling);
    requireCapability(actor, 'bulk', mode === 'proposal' ? 'propose' : 'read');
    z.array(z.unknown()).min(1).max(50).parse(entries);
    const ids = new Set<string>();
    const validation: Array<any> = [];
    for (const entry of entries) {
      try {
        operationIdSchema.parse(entry.operationId);
        if (ids.has(entry.operationId)) throw new McpError('validation', 'Duplicate operation ID in this batch.');
        ids.add(entry.operationId);
        const saved = await McpOperation.findOne({ actorKey: `grant:${actor.grantId}`, operationId: entry.operationId }).lean();
        if (saved) {
          if (saved.payloadHash !== digest(stable({ operation: entry.operation, mode, rationale: entry.rationale || '' })))
            throw new McpError('conflict', 'This operation ID was already used for a different payload.', 409);
          await this.authorizeRetry(actor, entry.operationId, entry.operation, mode);
        } else await prepare(actor, entry.operation, mode === 'proposal');
        if (mode === 'proposal') z.string().min(1).max(10000).parse(entry.rationale);
        validation.push({ valid: true });
      } catch (error) {
        const e = failure(error);
        validation.push({ valid: false, error: { code: e.code, message: e.message } });
      }
    }
    const results = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      let outcome = validation[index];
      if (outcome.valid && !dryRun) {
        try {
          outcome = { valid: true, result: await this.mutate(actor, entry.operationId, entry.operation, mode, entry.rationale || '') };
        } catch (error) {
          const e = failure(error);
          outcome = { valid: false, error: { code: e.code, message: e.message } };
        }
      }
      results.push({ index, operationId: entry.operationId, ...outcome });
    }
    return { dryRun, results };
  }
}

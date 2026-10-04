import Auth from '../../../../auth/model/Auth';
import { McpClient } from '../model/McpClient';
import { McpGrant } from '../model/McpGrant';
import { McpCredential } from '../model/McpCredential';
import { McpProposal } from '../model/McpProposal';
import { McpAudit } from '../model/McpAudit';
import { McpError } from '../util/McpError';
import { opaque, digest, equalSecret } from '../util/mcpCredentials';
import { once } from './McpOperation.handler';
import { audit } from './McpAudit.handler';
import { loadActor, touchActor } from './McpAccess.handler';
import { ContentWriteHandler } from './ContentWrite.handler';
import { prepare } from './ContentValidation.handler';
import { requireCapability } from '../util/mcpPolicy';

/** Explicit administration operations avoid generic CRUD exposing secrets or accidentally escalating grants. */
export class McpAdminHandler {
  constructor(private writes: ContentWriteHandler) {}

  /** Register a client and show a confidential secret once. Idempotent retries return metadata, never stored plaintext. */
  async createClient(adminId: string, operationId: string, data: any) {
    let secret: string | undefined;
    const result = await once(`admin:${adminId}`, operationId, { action: 'client_create', data }, async session => {
      secret = data.confidential ? opaque() : undefined;
      const [client] = await McpClient.create([{ ...data, clientId: data.clientId || `tapestry_${opaque()}`, secretHash: secret ? digest(secret) : undefined }], { session });
      await audit(`admin:${adminId}`, 'client_registered', { operationId, clientId: client.clientId, target: client.clientId, after: this.clientView(client.toObject()) }, session);
      return this.clientView(client.toObject());
    });
    if (secret && !equalSecret(secret, (await McpClient.findOne({ clientId: result.clientId }).select('+secretHash').lean())?.secretHash)) secret = undefined;
    return { ...result, ...(secret ? { clientSecret: secret } : {}) };
  }

  /** Update callback/name/active state; disabling a client revokes all of its credential families. */
  async updateClient(adminId: string, operationId: string, clientId: string, data: any) {
    return once(`admin:${adminId}`, operationId, { action: 'client_update', clientId, data }, async session => {
      const before = await McpClient.findOne({ clientId }).session(session).lean();
      if (!before) throw new McpError('not_found', 'Client not found.', 404);
      const callbacks = data.redirectUris || before.redirectUris;
      if (before.kind === 'machine' ? callbacks.length !== 0 : callbacks.length === 0) throw new McpError('validation', 'Callbacks do not match this client type.');
      const after = await McpClient.findOneAndUpdate({ clientId }, { $set: data }, { session, returnDocument: 'after', runValidators: true }).lean();
      // Changed callbacks invalidate existing authorizations as well as future pending browser intents.
      if (data.isActive === false || data.redirectUris) await McpCredential.updateMany({ clientId }, { $set: { revokedAt: new Date() } }, { session });
      await audit(`admin:${adminId}`, 'client_updated', { operationId, clientId, target: clientId, before: this.clientView(before), after: this.clientView(after) }, session);
      return this.clientView(after);
    });
  }

  /** Replace a confidential secret and revoke old tokens atomically; plaintext is returned only for the first response. */
  async rotateSecret(adminId: string, operationId: string, clientId: string) {
    let secret: string | undefined;
    const result = await once(`admin:${adminId}`, operationId, { action: 'client_rotate', clientId }, async session => {
      const client = await McpClient.findOne({ clientId, confidential: true }).session(session).lean();
      if (!client) throw new McpError('validation', 'Secret rotation requires a confidential client.');
      secret = opaque();
      await McpClient.updateOne({ clientId }, { $set: { secretHash: digest(secret) } }, { session });
      await McpCredential.updateMany({ clientId }, { $set: { revokedAt: new Date() } }, { session });
      await audit(`admin:${adminId}`, 'client_secret_rotated', { operationId, clientId, target: clientId }, session);
      return { clientId, rotated: true };
    });
    if (secret && !equalSecret(secret, (await McpClient.findOne({ clientId }).select('+secretHash').lean())?.secretHash)) secret = undefined;
    return { ...result, ...(secret ? { clientSecret: secret } : {}) };
  }

  /** Approve an active verified account connection with explicit capabilities and resource boundaries. */
  async createGrant(adminId: string, operationId: string, data: any) {
    return once(`admin:${adminId}`, operationId, { action: 'grant_create', data }, async session => {
      const client = await McpClient.findOne({ clientId: data.clientId, isActive: true }).session(session).lean();
      const owner = await Auth.findOne({ _id: data.ownerId, isActive: true, isEmailVerified: true }).session(session).lean();
      if (!client || !owner) throw new McpError('validation', 'An active client and verified active owner are required.');
      const [grant] = await McpGrant.create([{ ...data, kind: client.kind, expiresAt: new Date(data.expiresAt) }], { session });
      await audit(`admin:${adminId}`, 'grant_registered', { operationId, clientId: data.clientId, target: String(grant._id), after: grant.toObject() }, session);
      return grant.toObject();
    });
  }

  /** Tighten or expand a grant explicitly; revocation invalidates tokens, while scope ceilings prevent silent token upgrades. */
  async updateGrant(adminId: string, operationId: string, grantId: string, data: any) {
    return once(`admin:${adminId}`, operationId, { action: 'grant_update', grantId, data }, async session => {
      const before = await McpGrant.findById(grantId).session(session).lean();
      if (!before) throw new McpError('not_found', 'Grant not found.', 404);
      const after = await McpGrant.findByIdAndUpdate(grantId, { $set: data }, { session, returnDocument: 'after', runValidators: true }).lean();
      if (data.isActive === false) await McpCredential.updateMany({ grantId }, { $set: { revokedAt: new Date() } }, { session });
      await audit(`admin:${adminId}`, 'grant_updated', { operationId, clientId: before.clientId, target: grantId, before, after }, session);
      return after;
    });
  }

  /** Apply exactly the reviewed proposal in one transaction; a changed revision or revoked author leaves it pending. */
  async review(adminId: string, operationId: string, proposalId: string, decision: 'approve' | 'reject', note: string) {
    return once(`admin:${adminId}`, operationId, { action: `proposal_${decision}`, proposalId, note }, async session => {
      const proposal = await McpProposal.findById(proposalId).session(session).lean();
      if (!proposal) throw new McpError('not_found', 'Proposal not found.', 404);
      if (proposal.state !== 'pending') throw new McpError('conflict', 'This proposal was already reviewed.', 409);
      let result: any;
      if (decision === 'approve') {
        const source = await touchActor(await loadActor(String(proposal.grantId), proposal.clientId, undefined, session), session);
        requireCapability(source, 'propose');
        await this.writes.lockLore(proposal.operation, session);
        const prepared = await prepare(source, proposal.operation, true, session);
        await this.writes.chargeApproval(source);
        // Human review authorizes application, without granting the proposing agent direct-write or publish privileges.
        result = await this.writes.apply({ ...source, capabilities: [...new Set([...source.capabilities, 'create', 'update', 'publish'] as const)] }, prepared, operationId, session);
      }
      const after = await McpProposal.findOneAndUpdate({ _id: proposalId, state: 'pending' }, { $set: {
        state: decision === 'approve' ? 'applied' : 'rejected', reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note, ...(result ? { result } : {}),
      } }, { session, returnDocument: 'after' }).lean();
      if (!after) throw new McpError('conflict', 'Another reviewer handled this proposal.', 409);
      await audit(`admin:${adminId}`, `proposal_${decision}`, { operationId, clientId: proposal.clientId, target: proposalId, before: { state: 'pending' }, after: { state: after.state, result } }, session);
      return after;
    });
  }

  /** List bounded administrative records. Confidential fields are never selected or returned. */
  async list(kind: 'clients' | 'grants' | 'proposals' | 'audit', page: number, limit: number, state?: string) {
    const Model = { clients: McpClient, grants: McpGrant, proposals: McpProposal, audit: McpAudit }[kind];
    const docs = await Model.find(kind === 'proposals' && state ? { state } : {}).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return { records: kind === 'clients' ? docs.map(doc => this.clientView(doc)) : docs, page };
  }

  /** Fetch a reviewable proposal by ID; this method is reachable only after human reviewer authorization. */
  async getProposal(id: string) {
    const proposal = await McpProposal.findById(id).lean();
    if (!proposal) throw new McpError('not_found', 'Proposal not found.', 404);
    return proposal;
  }

  /** Keep both secret hashes and internal counters out of client administration responses and audit snapshots. */
  private clientView(client: any) {
    const { secretHash, useCount, ...view } = client;
    return view;
  }
}

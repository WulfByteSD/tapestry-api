import { Actor } from '../types/McpTypes';
import { McpError } from '../util/McpError';
import { requireCapability } from '../util/mcpPolicy';
import { redactReferences } from '../util/readableContent';
import { McpProposal } from '../model/McpProposal';

export class ContentProposalHandler {
  /** Return only this connection's proposals, retaining current type and setting restrictions. */
  async proposalGet(actor: Actor, id: string) {
    requireCapability(actor, 'propose');
    const doc = await McpProposal.findOne({ _id: id, grantId: actor.grantId, clientId: actor.clientId, ownerId: actor.ownerId }).lean();
    if (!doc) throw new McpError('not_found', 'Proposal not found.', 404);
    if (!actor.contentTypes.includes(doc.operation.type) || (doc.requiresShared && !actor.shared) ||
      (doc.settingKeys.length ? doc.settingKeys.some((key: string) => key === 'shared' ? !actor.shared : !actor.settingKeys.includes(key)) : !actor.shared))
      throw new McpError('forbidden', 'This proposal is outside the current grant.', 403);
    return { ...doc, operation: { ...doc.operation, data: await redactReferences(actor, doc.operation.type, doc.operation.data) } };
  }
}

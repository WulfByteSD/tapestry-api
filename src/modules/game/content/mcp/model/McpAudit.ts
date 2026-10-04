import { Schema } from 'mongoose';
import { model, options } from './mcpModel';

/** Append-only application audit events; domain snapshots exclude authentication secrets. */
const auditSchema = new Schema(
  {
    actorKey: String,
    clientId: String,
    ownerId: Schema.Types.ObjectId,
    grantId: Schema.Types.ObjectId,
    event: { type: String, required: true },
    operationId: String,
    target: String,
    code: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
  },
  options('content_mcp_audit')
);
auditSchema.index({ actorKey: 1, operationId: 1, event: 1, target: 1 });
export const McpAudit = model('ContentMcpAudit', auditSchema);

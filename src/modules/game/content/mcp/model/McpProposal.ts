import { Schema } from 'mongoose';
import { model, options } from './mcpModel';

/** Agent proposals stored independently of the live content library. */
export const McpProposal = model(
  'ContentMcpProposal',
  new Schema(
    {
      grantId: { type: Schema.Types.ObjectId, required: true },
      clientId: { type: String, required: true },
      ownerId: { type: Schema.Types.ObjectId, required: true },
      operation: { type: Schema.Types.Mixed, required: true },
      rationale: { type: String, required: true },
      settingKeys: { type: [String], required: true },
      requiresShared: { type: Boolean, default: false },
      state: { type: String, enum: ['pending', 'applied', 'rejected'], default: 'pending' },
      reviewedBy: Schema.Types.ObjectId,
      reviewedAt: Date,
      reviewNote: String,
      result: Schema.Types.Mixed,
    },
    options('content_mcp_proposals')
  )
);

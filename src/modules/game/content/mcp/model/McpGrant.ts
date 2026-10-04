import { Schema } from 'mongoose';
import { model, options } from './mcpModel';
import { CAPABILITIES, CONTENT_TYPES } from '../types/McpTypes';

/** Explicit bounded permissions for one approved account connection or machine client. */
const grantSchema = new Schema(
  {
    clientId: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, ref: 'Auth' },
    kind: { type: String, enum: ['interactive', 'machine'], required: true },
    capabilities: { type: [String], enum: CAPABILITIES, default: ['read', 'propose'] },
    contentTypes: { type: [String], enum: CONTENT_TYPES, required: true },
    settingKeys: { type: [String], default: [] },
    shared: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    useCount: { type: Number, default: 0 },
  },
  options('content_mcp_grants')
);
grantSchema.index({ clientId: 1, ownerId: 1 }, { unique: true });
// One grant per machine client; interactive clients may have multiple approved account connections.
grantSchema.index({ clientId: 1 }, { unique: true, partialFilterExpression: { kind: 'machine' } });
export const McpGrant = model('ContentMcpGrant', grantSchema);

import { Schema } from 'mongoose';
import { model, options } from './mcpModel';

/** Administrator-preregistered OAuth clients; plaintext secrets are never persisted. */
export const McpClient = model(
  'ContentMcpClient',
  new Schema(
    {
      clientId: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      kind: { type: String, enum: ['interactive', 'machine'], required: true },
      confidential: { type: Boolean, required: true },
      secretHash: { type: String, select: false },
      redirectUris: { type: [String], default: [] },
      isActive: { type: Boolean, default: true },
      useCount: { type: Number, default: 0 },
    },
    options('content_mcp_clients')
  )
);

import { Schema } from 'mongoose';
import { model, options } from './mcpModel';

/** Hashed OAuth credentials and browser consent intents, with expiry and replay tracking. */
const credentialSchema = new Schema(
  {
    hash: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['code', 'access', 'refresh', 'intent'], required: true },
    clientId: String,
    grantId: Schema.Types.ObjectId,
    ownerId: Schema.Types.ObjectId,
    resource: String,
    scopes: [String],
    family: String,
    consumedAt: Date,
    revokedAt: Date,
    expiresAt: { type: Date, required: true },
    redirectUri: String,
    codeChallenge: String,
    csrfHash: String,
    payload: Schema.Types.Mixed,
  },
  options('content_mcp_credentials')
);
credentialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
credentialSchema.index({ family: 1, kind: 1 });
export const McpCredential = model('ContentMcpCredential', credentialSchema);

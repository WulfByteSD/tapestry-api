import { Schema } from 'mongoose';
import { model, options } from './mcpModel';

/** Durable idempotency results, uniquely scoped to their authenticated actor. */
const operationSchema = new Schema(
  {
    actorKey: { type: String, required: true },
    operationId: { type: String, required: true },
    payloadHash: { type: String, required: true },
    result: { type: Schema.Types.Mixed, required: true },
  },
  options('content_mcp_operations')
);
operationSchema.index({ actorKey: 1, operationId: 1 }, { unique: true });
export const McpOperation = model('ContentMcpOperation', operationSchema);

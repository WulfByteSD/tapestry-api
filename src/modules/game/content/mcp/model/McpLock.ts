import { Schema } from 'mongoose';
import { model, options } from './mcpModel';

/** Serialize MCP lore moves within one setting to prevent concurrent parent changes from creating cycles. */
export const McpLock = model('ContentMcpLock', new Schema({ key: { type: String, required: true, unique: true }, useCount: { type: Number, default: 0 } }, options('content_mcp_locks')));

import { z } from 'zod';

export class McpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}
/** Convert domain and storage failures to stable client errors without exposing internal diagnostics. */
export function failure(error: unknown): McpError {
  if (error instanceof McpError) return error;
  const e = error as { code?: number; name?: string; message?: string; statusCode?: number };
  if (e?.code === 11000) return new McpError('duplicate', 'A record with this key already exists.', 409);
  if (e?.name === 'ValidationError' || e?.name === 'CastError' || error instanceof z.ZodError) {
    return new McpError('validation', error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : 'Content does not match its schema.');
  }
  if (e?.statusCode && e.statusCode < 500) return new McpError(e.statusCode === 409 ? 'conflict' : 'validation', e.message || 'Invalid content.', e.statusCode);
  return new McpError('unavailable', 'The operation could not be completed.', 503);
}

import mongoose, { ClientSession } from 'mongoose';
import { storageModels } from '../model';
import { McpError } from './McpError';
import { contentModels } from './contentRegistry';

/** Require replica-set/sharded MongoDB and commit content, side effects, audit, and retry results together. */
export async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw new McpError('unavailable', 'Authorization storage is unavailable.', 503);
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new McpError('transactions_required', 'MCP writes require transaction-capable MongoDB.', 503);
  await Promise.all([...storageModels, ...Object.values(contentModels)].map((m) => m.init()));
  const session = await mongoose.startSession();
  try {
    return (await session.withTransaction(() => work(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })) as T;
  } finally {
    await session.endSession();
  }
}

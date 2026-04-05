import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function makeClient(): Redis {
  const client = new Redis(REDIS_URL, { lazyConnect: true });
  client.on('error', (err) => console.error('[Redis] client error:', err));
  return client;
}

/** Used by the Socket.io Redis adapter for publishing events. */
export const pubClient = makeClient();

/** Duplicate of pubClient — required by @socket.io/redis-adapter. */
export const subClient = pubClient.duplicate();

/** General-purpose client for presence key reads/writes. */
export const presenceClient = makeClient();

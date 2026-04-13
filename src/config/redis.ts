import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_TOKEN = process.env.REDIS_TOKEN;

function makeClient(): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    ...(REDIS_TOKEN ? { password: REDIS_TOKEN } : {}),
  });
  client.on('error', (err) => console.error('[Redis] client error:', err));
  return client;
}

/** Used by the Socket.io Redis adapter for publishing events. */
export const pubClient = makeClient();

/** Duplicate of pubClient — required by @socket.io/redis-adapter. */
export const subClient = pubClient.duplicate();
subClient.on('error', (err) => console.error('[Redis] subClient error:', err));

/** General-purpose client for presence key reads/writes. */
export const presenceClient = makeClient();

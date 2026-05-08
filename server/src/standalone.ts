import { VynServer } from './core/engine.js';
import { RedisStore } from './persistence/redis-store.js';
import { MemoryStore } from './persistence/memory-store.js';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * VynRelay Standalone Server Runner
 *
 * This entry point is used when running VynRelay as a standalone service
 * (e.g., via Docker or CLI). It reads configuration from environment variables.
 *
 * ENV VARS:
 * - PORT: Port to listen on (default: 3000)
 * - PERSISTENCE: 'memory' or 'redis' (default: 'memory')
 * - REDIS_URL: Redis connection string (if PERSISTENCE=redis)
 * - AUTH_TOKEN: Static bearer token for authentication (optional)
 * - LOG_LEVEL: verbosity (todo)
 */

async function start() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const persistenceType = process.env.PERSISTENCE || 'memory';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const authToken = process.env.AUTH_TOKEN;

  let persistence;
  if (persistenceType === 'redis') {
    console.log(`[VynRelay] Using Redis persistence at ${redisUrl}`);
    persistence = new RedisStore({ url: redisUrl });
  } else {
    console.log('[VynRelay] Using In-Memory persistence');
    persistence = new MemoryStore();
  }

  const server = new VynServer({
    port,
    persistence,
    authHandler: async (token) => {
      // If no AUTH_TOKEN is set in env, the server allows all connections (open mode)
      if (!authToken) return true;
      return token === authToken;
    }
  });

  console.log(`[VynRelay] Server is matching hierarchical topics with reliability enabled.`);
  console.log(`[VynRelay] Listening on ws://0.0.0.0:${port}`);
  console.log(`[VynRelay] Auth Mode: ${authToken ? 'SECURE (Token Required)' : 'OPEN (No Token)'}`);
}

start().catch(err => {
  console.error('[VynRelay] Fatal error during startup:', err);
  process.exit(1);
});

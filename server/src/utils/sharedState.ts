// Counters and short-lived flags behind the rate limits, the failed-login
// lockout and the daily AI budget (A6, SRV-L16).
//
// With REDIS_URL set (Render Key Value in production) they live in Redis, so
// they survive restarts (Render's free plan sleeps and redeploys) and would be
// shared by several API instances. Without it, and whenever Redis is down or
// slow, they live in this process's memory, which is how they always worked:
// a Redis outage weakens the limits to per-process, never turns them off, and
// never holds a request up for longer than COMMAND_TIMEOUT_MS.
import { createClient } from '@redis/client';

type Client = ReturnType<typeof createClient>;

const KEY_PREFIX = 'orbit:';
const COMMAND_TIMEOUT_MS = 300;

let client: Client | null = null;
let lastErrorLogAt = 0;

const logError = (what: string, err: unknown) => {
  // A Redis outage would otherwise log once per request.
  const now = Date.now();
  if (now - lastErrorLogAt < 60_000) return;
  lastErrorLogAt = now;
  console.error(`[shared-state] ${what}; using in-memory counters until Redis is back:`, err instanceof Error ? err.message : err);
};

/** Where the counters live right now, for the start-up log and /health/ready. */
export const sharedStateMode = (): 'redis' | 'memory (Redis unavailable)' | 'memory' =>
  !client ? 'memory' : client.isReady ? 'redis' : 'memory (Redis unavailable)';

/**
 * Connects in the background (never blocks start-up) and keeps reconnecting.
 * Does nothing without a URL.
 */
export const connectSharedState = (url = process.env.REDIS_URL): void => {
  if (!url || client) return;
  let host = 'redis';
  try { host = new URL(url).host; } catch { /* reported by connect() */ }
  client = createClient({
    url,
    // Fail commands at once while disconnected instead of queueing them (a
    // queued command would hold its request until Redis came back).
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries: number) => Math.min(500 * 2 ** retries, 30_000),
    },
  });
  client.on('error', (err: unknown) => logError(`Redis error (${host})`, err));
  client.on('ready', () => console.log(`[shared-state] Redis ready (${host}): rate limits, lockouts and AI budgets are shared`));
  client.connect().catch((err: unknown) => logError(`can't connect to Redis (${host})`, err));
};

export const disconnectSharedState = async (): Promise<void> => {
  const c = client;
  client = null;
  if (c?.isOpen) await c.close().catch(() => c.destroy());
};

const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no reply within ${COMMAND_TIMEOUT_MS} ms`)), COMMAND_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });

/** Runs a command on Redis if it's up; undefined means "use memory". */
const onRedis = async <T>(run: (c: Client) => Promise<T>): Promise<T | undefined> => {
  if (!client?.isReady) return undefined;
  try {
    return await withTimeout(run(client));
  } catch (err) {
    logError('Redis command failed', err);
    return undefined;
  }
};

// --- In-memory fallback ---------------------------------------------------

const memory = new Map<string, { n: number; expiresAt: number }>();
const live = (key: string, now: number) => {
  const entry = memory.get(key);
  if (entry && entry.expiresAt <= now) {
    memory.delete(key);
    return undefined;
  }
  return entry;
};
const prune = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memory) if (entry.expiresAt <= now) memory.delete(key);
}, 10 * 60 * 1000);
prune.unref?.();

/** Forget everything kept in memory (tests). */
export const resetMemoryState = () => memory.clear();

// --- Operations -----------------------------------------------------------

// INCR, then start the window on the first hit. PTTL < 0 repairs a key that
// somehow lost its expiry, so a counter can never stick forever.
const HIT_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {n, ttl}`;

const DECR_SCRIPT = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n > 0 then redis.call('DECR', KEYS[1]) end
return 0`;

/**
 * Counts one hit in a fixed window that starts at the first hit and lasts
 * `windowMs`. `now` is for tests of the in-memory store; Redis keeps its own time.
 */
export const hit = async (key: string, windowMs: number, now = Date.now()): Promise<{ count: number; resetAt: number }> => {
  const reply = await onRedis(async (c) => {
    const [n, ttl] = (await c.sendCommand(['EVAL', HIT_SCRIPT, '1', KEY_PREFIX + key, String(Math.ceil(windowMs))])) as [number, number];
    return { count: Number(n), resetAt: Date.now() + Number(ttl) };
  });
  if (reply) return reply;
  let entry = live(key, now);
  if (!entry) {
    entry = { n: 0, expiresAt: now + windowMs };
    memory.set(key, entry);
  }
  entry.n += 1;
  return { count: entry.n, resetAt: entry.expiresAt };
};

/** Takes back one hit (never below zero), e.g. a request that turned out not to count. */
export const unhit = async (key: string, now = Date.now()): Promise<void> => {
  const done = await onRedis((c) => c.sendCommand(['EVAL', DECR_SCRIPT, '1', KEY_PREFIX + key]));
  if (done !== undefined) return;
  const entry = live(key, now);
  if (entry && entry.n > 0) entry.n -= 1;
};

/** Sets a flag that clears itself after `ttlMs`. */
export const setFlag = async (key: string, ttlMs: number, now = Date.now()): Promise<void> => {
  const done = await onRedis((c) => c.sendCommand(['SET', KEY_PREFIX + key, '1', 'PX', String(Math.ceil(ttlMs))]));
  if (done !== undefined) return;
  memory.set(key, { n: 1, expiresAt: now + ttlMs });
};

/** Milliseconds until a flag clears, or 0 if it isn't set. */
export const flagRemainingMs = async (key: string, now = Date.now()): Promise<number> => {
  const ttl = await onRedis((c) => c.sendCommand(['PTTL', KEY_PREFIX + key]) as Promise<number>);
  if (ttl !== undefined) return Math.max(0, Number(ttl));
  const entry = live(key, now);
  return entry ? Math.max(0, entry.expiresAt - now) : 0;
};

export const removeKeys = async (...keys: string[]): Promise<void> => {
  if (keys.length === 0) return;
  // Both places: a key counted in memory during an outage shouldn't outlive a reset.
  for (const key of keys) memory.delete(key);
  await onRedis((c) => c.sendCommand(['DEL', ...keys.map((k) => KEY_PREFIX + k)]));
};

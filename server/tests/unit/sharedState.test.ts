import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import {
  hit, unhit, setFlag, flagRemainingMs, removeKeys, resetMemoryState,
  connectSharedState, disconnectSharedState, sharedStateMode, acquireSharedLock,
} from '../../src/utils/sharedState';
import { SharedRateLimitStore } from '../../src/middleware/rateLimitStore';
import { acquireKeyLock, KeyLockBusy } from '../../src/utils/keyedLock';

const unique = () => `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

const untilReady = async () => {
  for (let i = 0; i < 60 && sharedStateMode() !== 'redis'; i++) await new Promise((r) => setTimeout(r, 50));
  expect(sharedStateMode()).toBe('redis');
};

// The same behaviour whichever store holds the counters.
const behaviours = () => {
  it('counts hits in a window that starts at the first one', async () => {
    const key = unique();
    expect((await hit(key, 60_000)).count).toBe(1);
    const second = await hit(key, 60_000);
    expect(second.count).toBe(2);
    expect(second.resetAt).toBeGreaterThan(Date.now() + 50_000);
    expect(second.resetAt).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it('starts a new window once the old one ends', async () => {
    const key = unique();
    await hit(key, 150);
    await hit(key, 150);
    await new Promise((r) => setTimeout(r, 250));
    expect((await hit(key, 150)).count).toBe(1);
  });

  it('takes a hit back, never below zero', async () => {
    const key = unique();
    await hit(key, 60_000);
    await unhit(key);
    await unhit(key);
    expect((await hit(key, 60_000)).count).toBe(1);
  });

  it('sets flags that clear themselves, and removes keys', async () => {
    const key = unique();
    expect(await flagRemainingMs(key)).toBe(0);
    await setFlag(key, 60_000);
    expect(await flagRemainingMs(key)).toBeGreaterThan(50_000);
    await removeKeys(key);
    expect(await flagRemainingMs(key)).toBe(0);
  });
};

describe('shared state in memory (no REDIS_URL)', () => {
  afterEach(() => resetMemoryState());
  it('says so', () => expect(sharedStateMode()).toBe('memory'));
  it('has no shared lock, so callers keep their in-process one', async () => {
    expect(await acquireSharedLock(unique(), 1_000, 1_000)).toEqual({ status: 'unavailable' });
  });
  behaviours();
});

describe('shared state when Redis is unreachable', () => {
  afterEach(async () => { await disconnectSharedState(); resetMemoryState(); });

  it('falls back to memory at once instead of waiting for Redis', async () => {
    connectSharedState('redis://127.0.0.1:1'); // nothing listens on port 1
    expect(sharedStateMode()).toBe('memory (Redis unavailable)');
    const started = Date.now();
    const key = unique();
    await hit(key, 60_000);
    expect((await hit(key, 60_000)).count).toBe(2);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

// Against a real Redis or Valkey when TEST_REDIS_URL is set (CI starts one).
describe.skipIf(!process.env.TEST_REDIS_URL)('shared state in Redis', () => {
  const connect = async () => {
    connectSharedState(process.env.TEST_REDIS_URL);
    await untilReady();
  };
  afterEach(async () => { await disconnectSharedState(); resetMemoryState(); });

  describe('operations', () => {
    beforeEach(connect);
    behaviours();
  });

  it('a lock shared by instances: a waiter gets it as soon as the holder releases', async () => {
    await connect();
    const key = unique();
    const first = await acquireSharedLock(key, 5_000, 100);
    expect(first.status).toBe('held');
    const started = Date.now();
    const waiting = acquireSharedLock(key, 5_000, 3_000);
    await new Promise((r) => setTimeout(r, 150));
    if (first.status === 'held') await first.release();
    const second = await waiting;
    expect(second.status).toBe('held');
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    if (second.status === 'held') await second.release();
  });

  it('busy, not a go-ahead, when the lock stays held past the wait', async () => {
    await connect();
    const key = unique();
    const holder = await acquireSharedLock(key, 5_000, 100);
    expect((await acquireSharedLock(key, 5_000, 120)).status).toBe('busy');
    if (holder.status === 'held') await holder.release();
  });

  it("an expired holder can't release the next holder's lock", async () => {
    await connect();
    const key = unique();
    const stale = await acquireSharedLock(key, 100, 50);
    await new Promise((r) => setTimeout(r, 200)); // its lock expires
    const current = await acquireSharedLock(key, 5_000, 50);
    expect(current.status).toBe('held');
    if (stale.status === 'held') await stale.release(); // too late: must not free the current one
    expect((await acquireSharedLock(key, 5_000, 80)).status).toBe('busy');
    if (current.status === 'held') await current.release();
  });

  it('the keyed lock answers busy (503) instead of saving unlocked, when SHARED_LOCKS is on', async () => {
    await connect();
    const key = unique();
    process.env.SHARED_LOCKS = 'on';
    process.env.SHARED_LOCK_WAIT_MS = '100';
    try {
      const elsewhere = await acquireSharedLock(key, 5_000, 100); // another instance
      await expect(acquireKeyLock(key)).rejects.toBeInstanceOf(KeyLockBusy);
      if (elsewhere.status === 'held') await elsewhere.release();
      const release = await acquireKeyLock(key);
      release();
    } finally {
      delete process.env.SHARED_LOCKS;
      delete process.env.SHARED_LOCK_WAIT_MS;
    }
  });

  it('keeps counts across a reconnect (a restarted API keeps its limits)', async () => {
    await connect();
    const key = unique();
    await hit(key, 60_000);
    await hit(key, 60_000);
    await disconnectSharedState();
    resetMemoryState();
    await connect();
    expect((await hit(key, 60_000)).count).toBe(3);
  });
});

describe('SharedRateLimitStore with express-rate-limit', () => {
  afterEach(() => resetMemoryState());

  const appWith = () => {
    const app = express();
    // Two limiters on the same key, as apiLimiter and userApiLimiter are: each
    // needs its own prefix or express-rate-limit reports a double count.
    app.use(rateLimit({ store: new SharedRateLimitStore(unique()), windowMs: 60_000, limit: 100, keyGenerator: () => 'same' }));
    app.use('/login', rateLimit({ store: new SharedRateLimitStore(unique()), windowMs: 60_000, limit: 2, skipSuccessfulRequests: true, keyGenerator: () => 'same' }));
    app.post('/login', (req, res) => { res.status(req.query.ok ? 200 : 400).end(); });
    return app;
  };

  it('limits, and successful requests given back do not count', async () => {
    const app = appWith();
    for (let i = 0; i < 5; i++) expect((await request(app).post('/login?ok=1')).status).toBe(200);
    expect((await request(app).post('/login')).status).toBe(400);
    expect((await request(app).post('/login')).status).toBe(400);
    expect((await request(app).post('/login')).status).toBe(429);
  });
});

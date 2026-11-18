// Serializes async work that shares a key.
//
// Idempotent creates are check-then-insert: "is there already a row with this
// clientRequestId? no → insert". Two concurrent requests with the same key (two
// tabs replaying the offline queue, a double-submitted import) can both pass the
// check and both insert. Holding a lock per (user, key) across the check and the
// insert closes that window.
//
// Within one process, always. Across API instances too when SHARED_LOCKS=on and
// REDIS_URL are set (SRV-L16): a Redis lock with the same key, taken after the
// in-process queue. It's off by default: with a single instance the in-process
// lock is enough, and the Redis round trips would only add latency. When it's
// on and the lock can't be had in time, the request gets 503 (the client
// retries) rather than going ahead unlocked. A partial unique index on
// (userId, clientRequestId) would be the stronger guarantee (see the runbook).
import { acquireSharedLock } from './sharedState';

const tails = new Map<string, Promise<void>>();

// A handler that never responds must not wedge its key forever.
const MAX_HOLD_MS = 30_000;
// How long to wait for another instance's holder before answering 503.
const sharedWaitMs = () => (Number(process.env.SHARED_LOCK_WAIT_MS) > 0 ? Number(process.env.SHARED_LOCK_WAIT_MS) : 10_000);

const sharedLocksOn = () => process.env.SHARED_LOCKS === 'on';

/** Another instance held the key for too long: the request should be retried. */
export class KeyLockBusy extends Error {
  readonly status = 503;
  constructor() {
    super('That change is being saved elsewhere right now. Try again in a moment.');
    this.name = 'KeyLockBusy';
  }
}

/**
 * Waits for earlier holders of `key`, then returns an idempotent release.
 * Rejects with KeyLockBusy when the shared lock is on and can't be taken.
 */
export const acquireKeyLock = async (key: string): Promise<() => void> => {
  const prev = tails.get(key) ?? Promise.resolve();
  let resolveMine!: () => void;
  const mine = new Promise<void>((resolve) => { resolveMine = resolve; });
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  await prev;

  const releaseLocal = () => {
    resolveMine();
    if (tails.get(key) === tail) tails.delete(key);
  };

  let releaseShared: (() => Promise<void>) | null = null;
  if (sharedLocksOn()) {
    const shared = await acquireSharedLock(key, MAX_HOLD_MS, sharedWaitMs());
    if (shared.status === 'busy') {
      releaseLocal();
      throw new KeyLockBusy();
    }
    if (shared.status === 'held') releaseShared = shared.release;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    void releaseShared?.();
    releaseLocal();
  };
  const timer = setTimeout(release, MAX_HOLD_MS);
  timer.unref?.();
  return release;
};

/** Holds `key` until the response is sent or the connection closes. Lets a
 *  handler that returns from many places hold the lock without restructuring.
 *  A client that goes away while waiting gives the lock back at once. */
export const holdKeyLockUntilResponse = async (
  key: string,
  res: { once(event: 'finish' | 'close', listener: () => void): unknown },
): Promise<void> => {
  let gone = false;
  const onGone = () => { gone = true; };
  res.once('close', onGone);
  const release = await acquireKeyLock(key);
  if (gone) {
    release();
    return;
  }
  res.once('finish', release);
  res.once('close', release);
};

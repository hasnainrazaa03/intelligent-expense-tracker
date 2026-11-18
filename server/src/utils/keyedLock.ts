// Serializes async work that shares a key, within this process.
//
// Idempotent creates are check-then-insert: "is there already a row with this
// clientRequestId? no → insert". Two concurrent requests with the same key (two
// tabs replaying the offline queue, a double-submitted import) can both pass the
// check and both insert. Holding a lock per (user, key) across the check and the
// insert closes that window.
//
// Across instances too when Redis is up (SRV-L16): after the in-process queue,
// a Redis lock with the same key (utils/sharedState). Without Redis it's the
// in-process lock alone, which is enough for a single instance.
import { acquireSharedLock } from './sharedState';

const tails = new Map<string, Promise<void>>();

// A handler that never responds must not wedge its key forever.
const MAX_HOLD_MS = 30_000;

/** Waits for earlier holders of `key`, then returns an idempotent release. */
export const acquireKeyLock = async (key: string): Promise<() => void> => {
  const prev = tails.get(key) ?? Promise.resolve();
  let resolveMine!: () => void;
  const mine = new Promise<void>((resolve) => { resolveMine = resolve; });
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  await prev;
  // Waits for another instance's holder at most as long as a hold can last.
  const releaseShared = await acquireSharedLock(key, MAX_HOLD_MS, MAX_HOLD_MS + 1_000);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    void releaseShared?.();
    resolveMine();
    if (tails.get(key) === tail) tails.delete(key);
  };
  const timer = setTimeout(release, MAX_HOLD_MS);
  timer.unref?.();
  return release;
};

/** Holds `key` until the response is sent or the connection closes. Lets a
 *  handler that returns from many places hold the lock without restructuring. */
export const holdKeyLockUntilResponse = async (
  key: string,
  res: { once(event: 'finish' | 'close', listener: () => void): unknown },
): Promise<void> => {
  const release = await acquireKeyLock(key);
  res.once('finish', release);
  res.once('close', release);
};

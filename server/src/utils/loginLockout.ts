// Failed-login lockout, keyed so an attacker can't lock the owner out.
//
// The old lockout was account-wide: 5 wrong passwords from ANY IP locked the
// account for 15 minutes, and the lock was checked before the password, so one
// IP repeating that every 15 minutes kept the owner out for good — even with the
// right password. Now:
//   - (account, IP): 5 failures → that IP is locked out of that account;
//   - account-wide: a much higher ceiling still stops a distributed guess run.
// In-memory, so single-instance (multi-instance needs a shared store: SRV-L16).

interface Counter { failures: number; windowStart: number; lockUntil: number }

const PER_IP_MAX = 5;
const ACCOUNT_MAX = 25;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const counters = new Map<string, Counter>();

const fresh = (now: number): Counter => ({ failures: 0, windowStart: now, lockUntil: 0 });

const get = (key: string, now: number): Counter => {
  const c = counters.get(key);
  if (!c) return fresh(now);
  // Failures older than the window no longer count (unless still locked).
  if (c.lockUntil <= now && now - c.windowStart > WINDOW_MS) return fresh(now);
  return c;
};

const ipKey = (email: string, ip: string | undefined) => `ip:${email}|${ip ?? 'unknown'}`;
const accountKey = (email: string) => `acct:${email}`;

/** Milliseconds until this (account, IP) may try again, or 0 if not locked. */
export const lockedForMs = (email: string, ip: string | undefined, now = Date.now()): number => {
  const remaining = (key: string) => Math.max(0, get(key, now).lockUntil - now);
  return Math.max(remaining(ipKey(email, ip)), remaining(accountKey(email)));
};

/** Record a failed attempt; returns true if it just triggered a lock. */
export const recordLoginFailure = (email: string, ip: string | undefined, now = Date.now()): boolean => {
  let locked = false;
  for (const [key, max] of [[ipKey(email, ip), PER_IP_MAX], [accountKey(email), ACCOUNT_MAX]] as const) {
    const c = get(key, now);
    c.failures += 1;
    if (c.failures >= max) {
      c.lockUntil = now + LOCK_MS;
      c.failures = 0;
      c.windowStart = now;
      locked = true;
    }
    counters.set(key, c);
  }
  return locked;
};

/** The right password from this IP: clear its counter (the account-wide one too). */
export const clearLoginFailures = (email: string, ip: string | undefined) => {
  counters.delete(ipKey(email, ip));
  counters.delete(accountKey(email));
};

// Drop idle entries so the map can't grow without bound.
const prune = setInterval(() => {
  const now = Date.now();
  for (const [key, c] of counters) {
    if (c.lockUntil <= now && now - c.windowStart > WINDOW_MS) counters.delete(key);
  }
}, 10 * 60 * 1000);
prune.unref?.();

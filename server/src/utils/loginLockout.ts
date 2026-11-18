// Failed-login lockout, keyed so an attacker can't lock the owner out.
//
// The old lockout was account-wide: 5 wrong passwords from ANY IP locked the
// account for 15 minutes, and the lock was checked before the password, so one
// IP repeating that every 15 minutes kept the owner out for good — even with the
// right password. Now:
//   - (account, IP): 5 failures → that IP is locked out of that account;
//   - account-wide: a much higher ceiling still stops a distributed guess run.
// Counted in utils/sharedState (Redis when configured), so a restart doesn't
// wipe a lockout, and several instances would see the same counts.
import { hit, setFlag, flagRemainingMs, removeKeys } from './sharedState';

const PER_IP_MAX = 5;
const ACCOUNT_MAX = 25;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const ipKey = (email: string, ip: string | undefined) => `ip:${email}|${ip ?? 'unknown'}`;
const accountKey = (email: string) => `acct:${email}`;

/** Milliseconds until this (account, IP) may try again, or 0 if not locked. */
export const lockedForMs = async (email: string, ip: string | undefined, now = Date.now()): Promise<number> => {
  const [perIp, account] = await Promise.all([
    flagRemainingMs(`lock:${ipKey(email, ip)}`, now),
    flagRemainingMs(`lock:${accountKey(email)}`, now),
  ]);
  return Math.max(perIp, account);
};

/** Record a failed attempt; resolves true if it just triggered a lock. */
export const recordLoginFailure = async (email: string, ip: string | undefined, now = Date.now()): Promise<boolean> => {
  let locked = false;
  for (const [key, max] of [[ipKey(email, ip), PER_IP_MAX], [accountKey(email), ACCOUNT_MAX]] as const) {
    // Failures count within a 15-minute window from the first one.
    const { count } = await hit(`fail:${key}`, WINDOW_MS, now);
    if (count >= max) {
      await setFlag(`lock:${key}`, LOCK_MS, now);
      await removeKeys(`fail:${key}`);
      locked = true;
    }
  }
  return locked;
};

/** The right password from this IP: clear its counter (the account-wide one too). */
export const clearLoginFailures = async (email: string, ip: string | undefined): Promise<void> => {
  const keys = [ipKey(email, ip), accountKey(email)];
  await removeKeys(...keys.flatMap((k) => [`fail:${k}`, `lock:${k}`]));
};

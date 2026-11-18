import { describe, it, expect } from 'vitest';
import { toCents, toDollars, expenseToClient } from '../../src/utils/money';
import { parseAmount, parseValidDate, MAX_AMOUNT } from '../../src/utils/math';
import { sanitizeText, sanitizeNotes } from '../../src/utils/sanitize';
import { normalizeTags, normalizeCurrencyCode, normalizeMetadata } from '../../src/utils/normalize';
import { lockedForMs, recordLoginFailure, clearLoginFailures } from '../../src/utils/loginLockout';
import { acquireKeyLock } from '../../src/utils/keyedLock';
import { newObjectId } from '../../src/utils/objectId';

describe('money: integer cents at rest, dollars at the API', () => {
  it('rounds to the nearest cent without float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.995)).toBe(2000);
    expect(toCents(1234.56)).toBe(123456);
    expect(toDollars(123456)).toBe(1234.56);
  });
  it('converts every money field of an expense for the client', () => {
    const e = expenseToClient({ amount: 1050, originalAmount: 87500, splitShares: [525, 525] });
    expect(e).toMatchObject({ amount: 10.5, originalAmount: 875, splitShares: [5.25, 5.25] });
  });
});

describe('math: amount and date parsing', () => {
  it('accepts numbers and numeric strings, rejects junk and anything over the cap', () => {
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount(40)).toBe(40);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(Infinity)).toBeNull();
    expect(parseAmount(MAX_AMOUNT + 1)).toBeNull();
    expect(parseAmount(MAX_AMOUNT)).toBe(MAX_AMOUNT);
  });
  it('rejects invalid dates', () => {
    expect(parseValidDate('2026-11-17')).toBeInstanceOf(Date);
    expect(parseValidDate('not a date')).toBeNull();
    expect(parseValidDate('')).toBeNull();
  });
});

describe('sanitize', () => {
  it('turns tabs and line breaks into spaces in one-line fields, strips tags and control chars', () => {
    expect(sanitizeText('Coffee\tShop\r\nDowntown <b>x</b>\u0007')).toBe('Coffee Shop Downtown x');
    expect(sanitizeText(42)).toBe('');
  });
  it('keeps line breaks in notes (normalised to \\n)', () => {
    expect(sanitizeNotes('Split with\r\nroommates\u0007\tok')).toBe('Split with\nroommates ok');
  });
});

describe('normalize', () => {
  it('cleans tags, currency codes and metadata', () => {
    expect(normalizeTags(['food', '', '<i>x</i>', 3])).toEqual(['food', 'x']);
    expect(normalizeTags('food')).toEqual([]);
    expect(normalizeCurrencyCode(' inr ')).toBe('INR');
    expect(normalizeCurrencyCode('rupees')).toBeNull();
    expect(normalizeMetadata({ store: 'Costco', empty: '' })).toEqual({ store: 'Costco' });
    expect(normalizeMetadata([])).toBeUndefined();
  });
});

describe('login lockout: per (account, IP), with an account-wide ceiling', () => {
  it('locks the attacking IP after 5 failures without locking the owner on another IP', async () => {
    const email = `lock.${Date.now()}@example.test`;
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) expect(await recordLoginFailure(email, '1.1.1.1', now)).toBe(false);
    expect(await recordLoginFailure(email, '1.1.1.1', now)).toBe(true);
    expect(await lockedForMs(email, '1.1.1.1', now)).toBeGreaterThan(0);
    expect(await lockedForMs(email, '2.2.2.2', now)).toBe(0);
    expect(await lockedForMs(email, '1.1.1.1', now + 16 * 60 * 1000)).toBe(0);
  });
  it('a distributed run still trips the account-wide limit', async () => {
    const email = `dist.${Date.now()}@example.test`;
    const now = 2_000_000;
    for (let i = 0; i < 25; i++) await recordLoginFailure(email, `10.0.0.${i}`, now);
    expect(await lockedForMs(email, '99.99.99.99', now)).toBeGreaterThan(0);
  });
  it('success clears the IP counter', async () => {
    const email = `clear.${Date.now()}@example.test`;
    for (let i = 0; i < 4; i++) await recordLoginFailure(email, '3.3.3.3', 5_000_000);
    await clearLoginFailures(email, '3.3.3.3');
    expect(await recordLoginFailure(email, '3.3.3.3', 5_000_000)).toBe(false);
  });
  it('failures older than the window stop counting', async () => {
    const email = `window.${Date.now()}@example.test`;
    for (let i = 0; i < 4; i++) await recordLoginFailure(email, '4.4.4.4', 6_000_000);
    expect(await recordLoginFailure(email, '4.4.4.4', 6_000_000 + 16 * 60 * 1000)).toBe(false);
  });
});

describe('keyed lock', () => {
  it('runs holders of the same key one at a time, in order', async () => {
    const order: string[] = [];
    const work = async (name: string, ms: number) => {
      const release = await acquireKeyLock('same-key');
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${name}:end`);
      release();
    };
    await Promise.all([work('a', 30), work('b', 1), work('c', 1)]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });
});

describe('objectId', () => {
  it('makes unique 24-hex ids', () => {
    const ids = new Set(Array.from({ length: 200 }, newObjectId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{24}$/);
  });
});

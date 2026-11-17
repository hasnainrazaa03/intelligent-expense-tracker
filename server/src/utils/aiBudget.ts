import { AsyncLocalStorage } from 'async_hooks';

// Per-user daily budget of Gemini calls (S8).
//
// The AI route limiter counts requests, but one request can make many model
// calls: a 200-row "AI-fill" runs 8 chunks, each with retries and a fallback
// model (up to 32 calls), and a statement parse up to 4. So the bill is bounded
// by counting calls, not requests. In-memory and single-instance, like the
// other limiters (SRV-L16 covers a shared store).

// Overridable for operations (and tests) via AI_DAILY_CALL_BUDGET.
export const DAILY_AI_CALLS = Number(process.env.AI_DAILY_CALL_BUDGET) > 0 ? Number(process.env.AI_DAILY_CALL_BUDGET) : 150;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const usage = new Map<string, { count: number; windowStart: number }>();

export class AiBudgetExceeded extends Error {
  readonly status = 429;
  constructor() {
    super('You have reached the daily AI limit. It resets within 24 hours.');
    this.name = 'AiBudgetExceeded';
  }
}

/** The signed-in user for the current AI request (set by the AI router). */
export const aiCaller = new AsyncLocalStorage<string>();

/** Charge one model call to the current user; throws once the budget is spent. */
export const chargeAiCall = (userId: string | undefined = aiCaller.getStore()): void => {
  if (!userId) return;
  const now = Date.now();
  let entry = usage.get(userId);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    usage.set(userId, entry);
  }
  if (entry.count >= DAILY_AI_CALLS) throw new AiBudgetExceeded();
  entry.count += 1;
};

/** Gemini said the project's quota is exhausted: retrying the same model just
 *  burns more calls (and time) for the same answer. */
export const isQuotaError = (error: unknown): boolean => {
  const e = error as { status?: number; message?: string } | undefined;
  return e?.status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(String(e?.message ?? ''));
};

const prune = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of usage) if (now - entry.windowStart > WINDOW_MS) usage.delete(key);
}, 60 * 60 * 1000);
prune.unref?.();

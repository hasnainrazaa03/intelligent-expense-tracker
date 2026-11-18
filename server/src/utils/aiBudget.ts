import { AsyncLocalStorage } from 'async_hooks';
import { hit } from './sharedState';

// Per-user daily budget of Gemini calls (S8).
//
// The AI route limiter counts requests, but one request can make many model
// calls: a 200-row "AI-fill" runs 8 chunks, each with retries and a fallback
// model (up to 32 calls), and a statement parse up to 4. So the bill is bounded
// by counting calls, not requests. Counted in utils/sharedState (Redis when
// configured), so a restart doesn't hand everyone a fresh day's budget.

// Overridable for operations (and tests) via AI_DAILY_CALL_BUDGET.
export const DAILY_AI_CALLS = Number(process.env.AI_DAILY_CALL_BUDGET) > 0 ? Number(process.env.AI_DAILY_CALL_BUDGET) : 150;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export class AiBudgetExceeded extends Error {
  readonly status = 429;
  constructor() {
    super('You have reached the daily AI limit. It resets within 24 hours.');
    this.name = 'AiBudgetExceeded';
  }
}

/** The signed-in user for the current AI request (set by the AI router). */
export const aiCaller = new AsyncLocalStorage<string>();

/** Charge one model call to the current user; rejects once the budget is spent. */
export const chargeAiCall = async (userId: string | undefined = aiCaller.getStore()): Promise<void> => {
  if (!userId) return;
  const { count } = await hit(`ai:${userId}`, WINDOW_MS);
  if (count > DAILY_AI_CALLS) throw new AiBudgetExceeded();
};

/** Gemini said the project's quota is exhausted: retrying the same model just
 *  burns more calls (and time) for the same answer. */
export const isQuotaError = (error: unknown): boolean => {
  const e = error as { status?: number; message?: string } | undefined;
  return e?.status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(String(e?.message ?? ''));
};

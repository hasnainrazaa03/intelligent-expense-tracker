// An express-rate-limit store on top of utils/sharedState: Redis when it's
// configured and up, this process's memory otherwise (A6, SRV-L16).
import type { Options, Store, IncrementResponse } from 'express-rate-limit';
import { hit, unhit, removeKeys } from '../utils/sharedState';

export class SharedRateLimitStore implements Store {
  /** Keys are shared between instances (when Redis is up), not local to this one. */
  readonly localKeys = false;
  /** Also what express-rate-limit uses to tell limiters apart on one request. */
  readonly prefix: string;
  private windowMs = 60_000;

  constructor(name: string) {
    this.prefix = `rl:${name}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const { count, resetAt } = await hit(this.prefix + key, this.windowMs);
    return { totalHits: count, resetTime: new Date(resetAt) };
  }

  async decrement(key: string): Promise<void> {
    await unhit(this.prefix + key);
  }

  async resetKey(key: string): Promise<void> {
    await removeKeys(this.prefix + key);
  }
}

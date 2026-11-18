// One-click unsubscribe from the email alerts (6f): a signed link in every
// alert email (and the List-Unsubscribe header mail apps use) turns
// notifyByEmail off without signing in. The token only does that: it carries a
// purpose and no session fields, so it can't be used to sign in.
import jwt from 'jsonwebtoken';
import { SERVER_CONFIG } from '../config';

const PURPOSE = 'email-alerts-off';

export const unsubscribeToken = (userId: string): string =>
  jwt.sign({ sub: userId, purpose: PURPOSE }, SERVER_CONFIG.jwtSecret, { algorithm: 'HS256' });

/** The user a token was made for, or null if it isn't a valid unsubscribe token. */
export const userFromUnsubscribeToken = (token: unknown): string | null => {
  if (typeof token !== 'string' || !token || token.length > 1000) return null;
  try {
    const payload = jwt.verify(token, SERVER_CONFIG.jwtSecret, { algorithms: ['HS256'] }) as { sub?: unknown; purpose?: unknown };
    return payload.purpose === PURPOSE && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

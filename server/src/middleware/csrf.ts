import { Request, Response, NextFunction } from 'express';
import { SERVER_CONFIG } from '../config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const csrfCookieName = SERVER_CONFIG.auth.csrfCookieName;
  const csrfHeaderName = SERVER_CONFIG.auth.csrfHeaderName;

  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[csrfCookieName];
  const headerToken = req.get(csrfHeaderName);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF token mismatch' });
  }

  return next();
};

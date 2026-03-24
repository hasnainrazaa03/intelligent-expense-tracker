import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SERVER_CONFIG } from '../config';

// Fail-fast: ensure JWT_SECRET is set at startup
const JWT_SECRET = SERVER_CONFIG.jwtSecret;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Exiting.');
  process.exit(1);
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SERVER_CONFIG.auth.cookieName];
  const token = cookieToken || bearerToken;

  if (token == null) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;

    // Validate that the payload contains the required fields
    if (!payload || !payload.id || !payload.email) {
      return res.status(403).json({ message: 'Invalid token payload' });
    }

    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (err: any) {
    // Differentiate expired vs malformed tokens
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(403).json({ message: 'Invalid token' });
  }
};
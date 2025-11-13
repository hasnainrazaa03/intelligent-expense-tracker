import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// This function now uses the standard types
// It will find the global 'Express.User' type we just defined
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    // 1. Cast the verified payload to our new global type
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as Express.User;

    // 2. This assignment is now 100% type-safe. No more conflicts.
    req.user = payload;
    
    next(); // Continue to the next handler
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};
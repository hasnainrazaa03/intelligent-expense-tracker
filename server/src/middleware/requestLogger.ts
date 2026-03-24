import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

type RequestWithRequestId = Request & { requestId?: string };

export const requestLogger = (req: RequestWithRequestId, res: Response, next: NextFunction): void => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const safePath = req.path;
    const safeUserId = req.user?.id ? `${req.user.id.slice(0, 4)}***` : undefined;
    const log = {
      requestId,
      method: req.method,
      path: safePath,
      statusCode: res.statusCode,
      durationMs,
      userId: safeUserId,
    };
    console.log(JSON.stringify(log));
  });

  next();
};

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
    const log = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id,
    };
    console.log(JSON.stringify(log));
  });

  next();
};

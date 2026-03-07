import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = (err as unknown as { status?: number }).status || 500;
  console.error(`[Error] ${req.method} ${req.path} -> ${status}: ${err.message}`);
  if (status >= 500) {
    console.error('[Error] Stack:', err.stack);
    const mem = process.memoryUsage();
    console.error(
      `[Error] Memory: heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB, rss ${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
    );
  }
  res.status(status).json({
    error: err.message || 'Internal server error',
    status,
  });
}

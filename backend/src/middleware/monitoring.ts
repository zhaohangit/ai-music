import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { sanitizeForLog } from '../utils/sanitize';

// API监控中间件
export function apiMonitor(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // 记录请求
  logger.info('API Request', sanitizeForLog({
    requestId: res.locals.requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }));

  // 记录响应
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('API Response', {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
}

// 音乐生成任务监控
export function trackMusicGeneration(taskId: string, provider: string) {
  const startTime = Date.now();

  logger.info('Music Generation Started', { taskId, provider, startTime });

  return {
    complete: (result: any) => {
      const duration = Date.now() - startTime;
      logger.info('Music Generation Complete', {
        taskId,
        provider,
        duration: `${duration}ms`,
        result: {
          status: result.status,
          title: result.title,
          duration: result.duration
        }
      });
    },
    error: (error: Error) => {
      const duration = Date.now() - startTime;
      logger.error('Music Generation Failed', {
        taskId,
        provider,
        duration: `${duration}ms`,
        error: error.message
      });
    }
  };
}

// 性能监控
export function performanceMonitor(req: Request, res: Response, next: NextFunction) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    // 如果请求超过1秒，记录警告
    if (durationMs > 1000) {
      logger.warn('Slow Request', {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        duration: `${durationMs.toFixed(2)}ms`,
      });
    }
  });

  next();
}

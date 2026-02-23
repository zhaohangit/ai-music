import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/errors';
import logger from '../utils/logger';
import { generateRequestId } from '../utils/response';

// 请求ID中间件
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.requestId = generateRequestId();
  next();
}

// 错误处理中间件
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 记录错误
  logger.error('Request Error', {
    path: req.path,
    method: req.method,
    requestId: res.locals.requestId,
    error: err.message,
    stack: err.stack,
  });

  // 处理已知错误
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      }
    });
  }

  // 处理未知错误
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCode.UNKNOWN,
      message: process.env.NODE_ENV === 'production'
        ? '服务器内部错误'
        : err.message,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId,
    }
  });
}

// 异步错误捕获包装器
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404处理
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 404,
      message: `路由 ${req.method} ${req.path} 不存在`,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId,
    }
  });
}

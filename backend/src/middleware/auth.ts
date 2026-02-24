import { Request, Response, NextFunction } from 'express';
import { ErrorCode, AppError } from '../types/errors';
import userService, { JwtPayload } from '../services/userService';

// 扩展Request类型 - 使用JwtPayload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// 简单的API Key认证（用于开发环境）
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];

  // 如果配置了API Key要求
  if (process.env.REQUIRE_API_KEY === 'true') {
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: '无效的API密钥'
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.locals.requestId,
        }
      });
    }
  }

  next();
}

// JWT认证（生产环境）
export function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // 在开发环境下跳过认证
    if (process.env.NODE_ENV === 'development') {
      req.user = { userId: 'dev-user', email: 'dev@example.com', username: 'dev-user' };
      return next();
    }

    return res.status(401).json({
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: '缺少认证令牌'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      }
    });
  }

  const token = authHeader.substring(7);

  // 验证JWT token
  try {
    const decoded = userService.verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的认证令牌'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      }
    });
  }
}

// 可选认证（不强制要求）
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // 尝试验证但不强制
    try {
      const token = authHeader.substring(7);
      const decoded = userService.verifyToken(token);
      if (decoded) {
        req.user = decoded;
      }
    } catch (error) {
      // 忽略错误，继续处理
    }
  }

  next();
}

// 管理员权限检查
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // 这里可以扩展JwtPayload来包含role字段
  // 目前简化处理
  if (!req.user) {
    return res.status(403).json({
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: '需要登录'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      }
    });
  }

  next();
}

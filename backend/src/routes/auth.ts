import { Router, Request, Response, NextFunction } from 'express';
import { success, fail } from '../utils/response';
import { asyncHandler } from '../middleware';
import userService from '../services/userService';
import logger from '../utils/logger';
import config from '../config';

const router = Router();

/**
 * 认证中间件
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return fail(res, 4001, '未提供认证Token', 401);
    }

    const token = authHeader.substring(7);
    const decoded = userService.verifyToken(token);

    if (!decoded) {
      return fail(res, 4001, 'Token无效或已过期', 401);
    }

    req.user = decoded;
    next();
  } catch (error) {
    logger.error('[Auth] 认证中间件错误', { error });
    return fail(res, 4001, '认证失败', 401);
  }
};

/**
 * 可选认证中间件 - 如果提供token则验证，不强制要求
 */
export const optionalAuthMiddleware = async (req: Request, res: Response, next: Function) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = userService.verifyToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }
    next();
  } catch (error) {
    // 忽略错误，继续执行
    next();
  }
};

/**
 * @route POST /api/auth/register
 * @desc 用户注册
 * @access Public
 */
router.post('/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, username, password } = req.body;

    logger.info('[Auth] 注册请求', { email, username });

    try {
      const result = await userService.register({ email, username, password });

      return success(res, {
        user: result.user,
        token: result.token,
        message: '注册成功'
      }, 201);
    } catch (error: any) {
      logger.error('[Auth] 注册失败', { error: error.message });
      return fail(res, 4001, error.message, 400);
    }
  })
);

/**
 * @route POST /api/auth/login
 * @desc 用户登录
 * @access Public
 */
router.post('/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    logger.info('[Auth] 登录请求', { email });

    try {
      const result = await userService.login({ email, password });

      return success(res, {
        user: result.user,
        token: result.token,
        message: '登录成功'
      });
    } catch (error: any) {
      logger.error('[Auth] 登录失败', { error: error.message });
      return fail(res, 4001, error.message, 401);
    }
  })
);

/**
 * @route GET /api/auth/me
 * @desc 获取当前用户信息
 * @access Private
 */
router.get('/me',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      return fail(res, 4001, '未授权', 401);
    }

    const user = userService.getUserById(userId);

    if (!user) {
      return fail(res, 4004, '用户不存在', 404);
    }

    return success(res, { user });
  })
);

/**
 * @route PUT /api/auth/profile
 * @desc 更新用户信息
 * @access Private
 */
router.put('/profile',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { username } = req.body;

    if (!userId) {
      return fail(res, 4001, '未授权', 401);
    }

    if (!username) {
      return fail(res, 4001, '请提供要更新的信息', 400);
    }

    const user = userService.updateUser(userId, { username });

    if (!user) {
      return fail(res, 4004, '用户不存在', 404);
    }

    return success(res, { user, message: '更新成功' });
  })
);

/**
 * @route POST /api/auth/change-password
 * @desc 修改密码
 * @access Private
 */
router.post('/change-password',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { oldPassword, newPassword } = req.body;

    if (!userId) {
      return fail(res, 4001, '未授权', 401);
    }

    if (!oldPassword || !newPassword) {
      return fail(res, 4001, '请提供原密码和新密码', 400);
    }

    try {
      await userService.changePassword(userId, oldPassword, newPassword);
      return success(res, { message: '密码修改成功' });
    } catch (error: any) {
      return fail(res, 4001, error.message, 400);
    }
  })
);

/**
 * @route POST /api/auth/verify
 * @desc 验证Token是否有效
 * @access Public
 */
router.post('/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;

    if (!token) {
      return fail(res, 4001, '请提供Token', 400);
    }

    const decoded = userService.verifyToken(token);

    if (!decoded) {
      return fail(res, 4001, 'Token无效或已过期', 401);
    }

    const user = userService.getUserById(decoded.userId);

    return success(res, {
      valid: true,
      user,
      decoded
    });
  })
);

/**
 * @route GET /api/auth/status
 * @desc 获取认证服务状态
 * @access Public
 */
router.get('/status',
  asyncHandler(async (req: Request, res: Response) => {
    return success(res, {
      status: 'ok',
      userCount: userService.getUserCount(),
      jwtConfigured: !!config.jwt.secret
    });
  })
);

export default router;

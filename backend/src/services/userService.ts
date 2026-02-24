import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../utils/logger';

// 用户接口
export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

// 用户注册信息
export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

// 用户登录信息
export interface LoginInput {
  email: string;
  password: string;
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
}

// 内存用户存储 (生产环境应使用数据库)
const users: Map<string, User> = new Map();
const emailIndex: Map<string, string> = new Map(); // email -> userId

/**
 * 用户服务
 * 提供用户注册、登录、JWT认证等功能
 */
class UserService {
  private jwtSecret: string;
  private saltRounds: number = 10;

  constructor() {
    this.jwtSecret = config.jwt.secret;
    logger.info('[UserService] 用户服务初始化完成');
  }

  /**
   * 生成用户ID
   */
  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 密码加密
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * 验证密码
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * 生成JWT Token
   */
  generateToken(user: User): string {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      username: user.username
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '7d' // 7天过期
    });
  }

  /**
   * 验证JWT Token
   */
  verifyToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      return decoded;
    } catch (error) {
      logger.warn('[UserService] Token验证失败', { error });
      return null;
    }
  }

  /**
   * 用户注册
   */
  async register(input: RegisterInput): Promise<{ user: Omit<User, 'passwordHash'>; token: string }> {
    const { email, username, password } = input;

    // 验证输入
    if (!email || !username || !password) {
      throw new Error('请填写完整的注册信息');
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('邮箱格式不正确');
    }

    // 验证用户名长度
    if (username.length < 2 || username.length > 20) {
      throw new Error('用户名长度应在2-20个字符之间');
    }

    // 验证密码强度
    if (password.length < 6) {
      throw new Error('密码长度至少6个字符');
    }

    // 检查邮箱是否已注册
    if (emailIndex.has(email)) {
      throw new Error('该邮箱已被注册');
    }

    // 加密密码
    const passwordHash = await this.hashPassword(password);

    // 创建用户
    const userId = this.generateUserId();
    const now = new Date().toISOString();

    const user: User = {
      id: userId,
      email,
      username,
      passwordHash,
      createdAt: now,
      updatedAt: now
    };

    // 存储用户
    users.set(userId, user);
    emailIndex.set(email, userId);

    logger.info('[UserService] 用户注册成功', { userId, email, username });

    // 生成Token
    const token = this.generateToken(user);

    // 返回用户信息（不包含密码）
    const { passwordHash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  /**
   * 用户登录
   */
  async login(input: LoginInput): Promise<{ user: Omit<User, 'passwordHash'>; token: string }> {
    const { email, password } = input;

    // 验证输入
    if (!email || !password) {
      throw new Error('请输入邮箱和密码');
    }

    // 查找用户
    const userId = emailIndex.get(email);
    if (!userId) {
      throw new Error('邮箱或密码错误');
    }

    const user = users.get(userId);
    if (!user) {
      throw new Error('邮箱或密码错误');
    }

    // 验证密码
    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('邮箱或密码错误');
    }

    logger.info('[UserService] 用户登录成功', { userId, email });

    // 生成Token
    const token = this.generateToken(user);

    // 返回用户信息（不包含密码）
    const { passwordHash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  /**
   * 获取用户信息
   */
  getUserById(userId: string): Omit<User, 'passwordHash'> | null {
    const user = users.get(userId);
    if (!user) {
      return null;
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * 更新用户信息
   */
  updateUser(userId: string, updates: Partial<Pick<User, 'username'>>): Omit<User, 'passwordHash'> | null {
    const user = users.get(userId);
    if (!user) {
      return null;
    }

    if (updates.username) {
      user.username = updates.username;
    }
    user.updatedAt = new Date().toISOString();

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * 修改密码
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const user = users.get(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证旧密码
    const isValid = await this.verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('原密码错误');
    }

    // 验证新密码
    if (newPassword.length < 6) {
      throw new Error('新密码长度至少6个字符');
    }

    // 更新密码
    user.passwordHash = await this.hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();

    logger.info('[UserService] 密码修改成功', { userId });
    return true;
  }

  /**
   * 删除用户
   */
  deleteUser(userId: string): boolean {
    const user = users.get(userId);
    if (!user) {
      return false;
    }

    emailIndex.delete(user.email);
    users.delete(userId);

    logger.info('[UserService] 用户删除成功', { userId });
    return true;
  }

  /**
   * 获取用户数量
   */
  getUserCount(): number {
    return users.size;
  }
}

// 导出单例
export const userService = new UserService();
export default userService;

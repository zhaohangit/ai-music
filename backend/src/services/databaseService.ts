import { Pool, PoolClient, QueryResult } from 'pg';
import Redis from 'ioredis';
import config from '../config';
import logger from '../utils/logger';

// 数据库配置接口
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

// Redis配置接口
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

/**
 * 数据库服务
 * 管理PostgreSQL和Redis连接
 */
class DatabaseService {
  private pgPool: Pool | null = null;
  private redisClient: Redis | null = null;
  private isPgConnected: boolean = false;
  private isRedisConnected: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化数据库连接
   */
  private async initialize(): Promise<void> {
    // 初始化PostgreSQL
    if (process.env.DATABASE_URL) {
      await this.initializePostgreSQLFromURL(process.env.DATABASE_URL);
    } else if (process.env.PG_HOST) {
      await this.initializePostgreSQL({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        database: process.env.PG_DATABASE || 'music_ai',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    }

    // 初始化Redis
    if (config.redis.url || process.env.REDIS_HOST) {
      await this.initializeRedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      });
    }

    logger.info('[Database] 服务初始化完成', {
      postgres: this.isPgConnected,
      redis: this.isRedisConnected,
    });
  }

  /**
   * 从URL初始化PostgreSQL连接
   */
  private async initializePostgreSQLFromURL(url: string): Promise<void> {
    try {
      this.pgPool = new Pool({ connectionString: url });

      // 测试连接
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isPgConnected = true;
      logger.info('[Database] PostgreSQL连接成功 (URL模式)');

      // 创建表
      await this.createTables();
    } catch (error) {
      logger.warn('[Database] PostgreSQL连接失败', { error });
      this.isPgConnected = false;
    }
  }

  /**
   * 初始化PostgreSQL连接
   */
  private async initializePostgreSQL(dbConfig: DatabaseConfig): Promise<void> {
    try {
      this.pgPool = new Pool(dbConfig);

      // 测试连接
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isPgConnected = true;
      logger.info('[Database] PostgreSQL连接成功');

      // 创建表
      await this.createTables();
    } catch (error) {
      logger.warn('[Database] PostgreSQL连接失败', { error });
      this.isPgConnected = false;
    }
  }

  /**
   * 初始化Redis连接
   */
  private async initializeRedis(redisConfig: RedisConfig): Promise<void> {
    try {
      const redisUrl = config.redis.url || `redis://${redisConfig.host}:${redisConfig.port}`;
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      await this.redisClient.ping();
      this.isRedisConnected = true;
      logger.info('[Database] Redis连接成功');
    } catch (error) {
      logger.warn('[Database] Redis连接失败', { error });
      this.isRedisConnected = false;
    }
  }

  /**
   * 创建数据表
   */
  private async createTables(): Promise<void> {
    if (!this.pgPool) return;

    const createTablesSQL = `
      -- 用户表
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 音乐表
      CREATE TABLE IF NOT EXISTS music_tracks (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id),
        title VARCHAR(255),
        status VARCHAR(20) DEFAULT 'processing',
        tags TEXT[],
        mood VARCHAR(100),
        lyrics TEXT,
        audio_url TEXT,
        video_url TEXT,
        image_url TEXT,
        duration INTEGER,
        is_favorite BOOLEAN DEFAULT FALSE,
        mode VARCHAR(50),
        llm_used VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_music_tracks_user_id ON music_tracks(user_id);
      CREATE INDEX IF NOT EXISTS idx_music_tracks_status ON music_tracks(status);
      CREATE INDEX IF NOT EXISTS idx_music_tracks_created_at ON music_tracks(created_at DESC);
    `;

    try {
      await this.pgPool.query(createTablesSQL);
      logger.info('[Database] 数据表创建/验证成功');
    } catch (error) {
      logger.error('[Database] 创建数据表失败', { error });
    }
  }

  /**
   * 检查PostgreSQL是否可用
   */
  isPostgreSQLAvailable(): boolean {
    return this.isPgConnected;
  }

  /**
   * 检查Redis是否可用
   */
  isRedisAvailable(): boolean {
    return this.isRedisConnected;
  }

  /**
   * 获取PostgreSQL连接池
   */
  getPool(): Pool | null {
    return this.pgPool;
  }

  /**
   * 获取Redis客户端
   */
  getRedis(): Redis | null {
    return this.redisClient;
  }

  /**
   * 执行SQL查询
   */
  async query(sql: string, params?: any[]): Promise<QueryResult<any>> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL未连接');
    }
    return this.pgPool.query(sql, params);
  }

  /**
   * 获取PostgreSQL客户端（用于事务）
   */
  async getClient(): Promise<PoolClient | null> {
    if (!this.pgPool) {
      return null;
    }
    return this.pgPool.connect();
  }

  /**
   * Redis: 获取值
   */
  async cacheGet(key: string): Promise<string | null> {
    if (!this.redisClient) {
      return null;
    }
    return this.redisClient.get(key);
  }

  /**
   * Redis: 设置值
   */
  async cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.redisClient) {
      return;
    }
    if (ttlSeconds) {
      await this.redisClient.setex(key, ttlSeconds, value);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  /**
   * Redis: 删除值
   */
  async cacheDel(key: string): Promise<void> {
    if (!this.redisClient) {
      return;
    }
    await this.redisClient.del(key);
  }

  /**
   * Redis: 检查键是否存在
   */
  async cacheExists(key: string): Promise<boolean> {
    if (!this.redisClient) {
      return false;
    }
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  /**
   * 关闭所有连接
   */
  async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      logger.info('[Database] PostgreSQL连接已关闭');
    }

    if (this.redisClient) {
      this.redisClient.disconnect();
      logger.info('[Database] Redis连接已关闭');
    }
  }

  /**
   * 获取数据库状态
   */
  getStatus(): {
    postgres: { connected: boolean; url?: string };
    redis: { connected: boolean; url?: string };
  } {
    return {
      postgres: {
        connected: this.isPgConnected,
        url: process.env.DATABASE_URL ? '(configured)' : process.env.PG_HOST,
      },
      redis: {
        connected: this.isRedisConnected,
        url: config.redis.url || process.env.REDIS_HOST,
      },
    };
  }
}

// 导出单例
export const databaseService = new DatabaseService();
export default databaseService;

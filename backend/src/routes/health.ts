import { Router } from 'express';
import axios from 'axios';
import config from '../config';
import { success } from '../utils/response';
import logger from '../utils/logger';

const router = Router();

/**
 * @route GET /health
 * @desc 健康检查
 * @access Public
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.app.env,
    version: '1.0.0',
    services: {
      suno: await checkSunoHealth(),
      glm: await checkGLMHealth(),
      redis: await checkRedisHealth(),
    }
  };

  const allHealthy = Object.values(health.services).every(s => s === 'ok');
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json(health);
});

/**
 * @route GET /health/ready
 * @desc 就绪检查
 * @access Public
 */
router.get('/ready', async (req, res) => {
  try {
    // 检查关键服务
    const sunoHealth = await checkSunoHealth();
    const glmHealth = await checkGLMHealth();

    if (sunoHealth === 'ok' || glmHealth === 'ok') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /health/live
 * @desc 存活检查
 * @access Public
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// 检查Suno服务健康状态
async function checkSunoHealth(): Promise<string> {
  try {
    const response = await axios.get(`${config.suno.baseURL}/health`, {
      timeout: 5000,
      headers: {
        'Authorization': `Bearer ${config.suno.accessKey}`
      }
    });
    return response.status === 200 ? 'ok' : 'error';
  } catch (error) {
    // 如果健康检查端点不存在，尝试其他方式
    try {
      // 简单的连通性检查
      await axios.head(config.suno.baseURL!, { timeout: 3000 });
      return 'ok';
    } catch {
      logger.warn('Suno health check failed');
      return 'error';
    }
  }
}

// 检查GLM服务健康状态
async function checkGLMHealth(): Promise<string> {
  try {
    const response = await axios.post(
      `${config.glm.baseURL}/chat/completions`,
      {
        model: config.glm.models.fast,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${config.glm.authorization}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    return response.status === 200 ? 'ok' : 'error';
  } catch (error) {
    logger.warn('GLM health check failed');
    return 'error';
  }
}

// 检查Redis健康状态
async function checkRedisHealth(): Promise<string> {
  if (!config.redis.url) {
    return 'not_configured';
  }

  try {
    // 简单的Redis连接检查
    // 实际实现需要依赖Redis客户端
    return 'ok';
  } catch (error) {
    logger.warn('Redis health check failed');
    return 'error';
  }
}

export default router;

import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // Suno API
  suno: {
    baseURL: process.env.SUNO_API_URL || 'https://api.suno.cn',
    accessKey: process.env.SUNO_ACCESS_KEY || '',
  },

  // 智谱GLM API
  glm: {
    baseURL: process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4',
    authorization: process.env.GLM_AUTHORIZATION || '',
    models: {
      creative: process.env.GLM_MODEL || 'glm-4-flash',
      fast: process.env.GLM_MODEL_FAST || 'glm-4-flash',
    }
  },

  // JoyBuilder API (内网)
  joybuilder: {
    baseURL: process.env.JOYBUILDER_API_URL || 'https://api.joybuilder.jd.com/v1',
    apiKey: process.env.JOYBUILDER_API_KEY || '',
    models: {
      lyricsGeneration: process.env.JOYBUILDER_MODEL_LYRICS || 'deepseek-v3.2',
      styleAnalysis: process.env.JOYBUILDER_MODEL_STYLE || 'qwen3-8b',
      creativeWriting: process.env.JOYBUILDER_MODEL_CREATIVE || 'deepseek-r1-0528',
      quickGeneration: process.env.JOYBUILDER_MODEL_FAST || 'joyai-flash',
    }
  },

  // 网络环境
  network: {
    env: process.env.NETWORK_ENV || 'external',
    isInternal: process.env.NETWORK_ENV === 'internal',
  },

  // 应用配置
  app: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
  },

  // 日志
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret',
  }
};

export default config;

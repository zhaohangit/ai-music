import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 导入配置
import config from './config';

// 导入中间件
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
  apiMonitor,
  apiLimiter
} from './middleware';

// 导入路由
import musicRoutes from './routes/music';
import lyricsRoutes from './routes/lyrics';
import healthRoutes from './routes/health';

// 导入服务初始化
import sunoService from './services/sunoService';
import glmService from './services/glmService';
import musicOrchestrator from './services/musicOrchestrator';

// 导入日志
import logger from './utils/logger';

// 创建Express应用
const app = express();

// 基础中间件
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',')
    : true, // Allow all origins in development
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求ID和监控中间件
app.use(requestIdMiddleware);
app.use(apiMonitor);

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 文件上传配置
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的音频格式'));
    }
  }
});

// 初始化服务
musicOrchestrator.setLlmService(glmService);
musicOrchestrator.setMusicService(sunoService);

// API路由
app.use('/health', healthRoutes);
app.use('/api/music', apiLimiter, musicRoutes);
app.use('/api/lyrics', apiLimiter, lyricsRoutes);

// API文档路由（开发环境）
if (config.app.env === 'development') {
  app.get('/api', (req, res) => {
    res.json({
      name: 'AI Music Pro API',
      version: '1.0.0',
      endpoints: {
        music: {
          'POST /api/music/create': '创建歌曲',
          'GET /api/music/status/:id': '查询歌曲状态',
          'GET /api/music/list': '获取歌曲列表',
          'POST /api/music/wait/:id': '等待生成完成',
          'POST /api/music/upload': '上传音频',
          'POST /api/music/cover': '创建翻唱'
        },
        lyrics: {
          'POST /api/lyrics/generate': '生成歌词',
          'POST /api/lyrics/enhance': '增强提示词',
          'POST /api/lyrics/polish': '润色歌词',
          'POST /api/lyrics/recommend-style': '风格推荐'
        },
        health: {
          'GET /health': '健康检查',
          'GET /health/ready': '就绪检查',
          'GET /health/live': '存活检查'
        }
      }
    });
  });
}

// 错误处理
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.app.port;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`, {
    environment: config.app.env,
    port: PORT,
    network: config.network.env
  });
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

export default app;

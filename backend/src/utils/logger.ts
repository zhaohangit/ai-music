import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 确保日志目录存在
const logsDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'music-ai' },
  transports: [
    // 错误日志单独存储
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    // 所有日志
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
  ],
});

// 开发环境输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

export default logger;

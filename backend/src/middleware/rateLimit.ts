import rateLimit from 'express-rate-limit';
import { ErrorCode } from '../types/errors';

// 普通API限流
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100次请求
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT,
        message: '请求过于频繁，请稍后再试'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      }
    });
  }
});

// 音乐生成限流（更严格）
export const musicGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 20, // 每个IP最多20次生成
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT,
        message: '音乐生成次数已达上限，请1小时后再试'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      }
    });
  }
});

// 歌词生成限流
export const lyricsGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 50, // 每个IP最多50次
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT,
        message: '歌词生成次数已达上限，请1小时后再试'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      }
    });
  }
});

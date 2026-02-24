import { body, validationResult, ValidationChain } from 'express-validator';
import { fail } from '../utils/response';
import { Request, Response, NextFunction } from 'express';

// 验证结果处理
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, 1001, '参数验证失败', 400, errors.array());
  }
  next();
};

// 音乐创作验证规则
export const validateMusicCreationRules: ValidationChain[] = [
  body('mode')
    .optional()
    .isIn(['inspiration', 'custom', 'full_ai', 'lyrics_only', 'music_only'])
    .withMessage('无效的生成模式'),

  body('prompt')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('描述不能超过1000字符'),

  body('title')
    .optional()
    .isLength({ max: 100 })
    .withMessage('标题不能超过100字符'),

  body('lyrics')
    .optional()
    .isLength({ max: 5000 })
    .withMessage('歌词不能超过5000字符'),

  body('tags')
    .optional()
    .isLength({ max: 200 })
    .withMessage('风格标签不能超过200字符'),

  body('mv')
    .optional()
    .isIn(['chirp-v3-0', 'chirp-v3-5', 'chirp-v4', 'chirp-auk-turbo', 'chirp-auk', 'chirp-bluejay', 'chirp-crow', 'v3', 'v3.0', 'v3.5', 'v4', 'auk-turbo', 'auk', 'bluejay', 'crow'])
    .withMessage('无效的模型版本'),

  body('instrumental')
    .optional()
    .isBoolean()
    .withMessage('instrumental必须是布尔值'),
];

// 音乐创作验证（包含验证中间件）
export const validateMusicCreation = [
  ...validateMusicCreationRules,
  validate
];

// 歌词生成验证规则
export const validateLyricsGenerationRules: ValidationChain[] = [
  body('idea')
    .notEmpty()
    .withMessage('创作想法不能为空')
    .isLength({ max: 500 })
    .withMessage('创作想法不能超过500字符'),

  body('style')
    .optional()
    .isLength({ max: 100 })
    .withMessage('风格描述不能超过100字符'),

  body('mood')
    .optional()
    .isLength({ max: 50 })
    .withMessage('情绪描述不能超过50字符'),
];

// 歌词生成验证（包含验证中间件）
export const validateLyricsGeneration = [
  ...validateLyricsGenerationRules,
  validate
];

// 翻唱请求验证规则
export const validateCoverCreationRules: ValidationChain[] = [
  body('upload_id')
    .notEmpty()
    .withMessage('上传ID不能为空'),

  body('prompt')
    .optional()
    .isLength({ max: 500 })
    .withMessage('描述不能超过500字符'),

  body('tags')
    .optional()
    .isLength({ max: 200 })
    .withMessage('风格标签不能超过200字符'),
];

// 翻唱请求验证（包含验证中间件）
export const validateCoverCreation = [
  ...validateCoverCreationRules,
  validate
];

// 风格推荐验证规则
export const validateStyleRecommendationRules: ValidationChain[] = [
  body('description')
    .notEmpty()
    .withMessage('描述不能为空')
    .isLength({ max: 500 })
    .withMessage('描述不能超过500字符'),
];

// 风格推荐验证（包含验证中间件）
export const validateStyleRecommendation = [
  ...validateStyleRecommendationRules,
  validate
];

// 错误码枚举
export enum ErrorCode {
  // 通用错误 1xxx
  UNKNOWN = 1000,
  INVALID_PARAMS = 1001,
  UNAUTHORIZED = 1002,
  RATE_LIMIT = 1003,

  // Suno错误 2xxx
  SUNO_AUTH_FAILED = 2001,
  SUNO_GENERATION_FAILED = 2002,
  SUNO_TIMEOUT = 2003,
  SUNO_QUOTA_EXCEEDED = 2004,

  // LLM错误 3xxx
  LLM_AUTH_FAILED = 3001,
  LLM_GENERATION_FAILED = 3002,
  LLM_TIMEOUT = 3003,
  LLM_CONTENT_FILTER = 3004,
}

// 应用错误基类
export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: any;

  constructor(code: ErrorCode, message: string, statusCode = 500, details?: any) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}

// Suno错误
export class SunoError extends AppError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, 502, details);
    this.name = 'SunoError';
  }
}

// LLM错误
export class LLMError extends AppError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, 502, details);
    this.name = 'LLMError';
  }
}

// API响应接口
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

// 音乐生成模式
export type MusicGenerationMode = 'inspiration' | 'custom' | 'full_ai' | 'lyrics_only' | 'music_only';

// LLM提供商
export enum LLMProvider {
  JOYBUILDER = 'joybuilder',
  GLM = 'glm',
  SUNO = 'suno'
}

// 歌曲状态
export type MusicStatus = 'processing' | 'complete' | 'error';

// 歌曲信息接口
export interface MusicInfo {
  id: string;
  status: MusicStatus;
  title?: string;
  audio_url?: string;
  video_url?: string;
  image_url?: string;
  duration?: number;
  lyrics?: string;
  created_at?: string;
  // open.suno.cn task query error info / metadata
  errormsg?: string;
  errormsgEn?: string;
  custom_id?: string;
}

// 歌词生成结果
export interface LyricsResult {
  title: string;
  lyrics: string;
}

// 风格推荐结果
export interface StyleRecommendation {
  tags: string[];
  mood: string;
  tempo: string;
}

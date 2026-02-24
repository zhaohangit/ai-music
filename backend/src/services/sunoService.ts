import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import logger from '../utils/logger';
import { SunoError, ErrorCode, MusicInfo, MusicStatus, LyricsResult } from '../types/errors';

// 模型版本映射
const MODEL_VERSION_MAP: Record<string, string> = {
  'v3.5': 'chirp-v3-5',
  'v3': 'chirp-v3-5',
  'v4': 'chirp-v4',
  'v4.5': 'chirp-v4-5',
  'v5': 'chirp-v5',
  'chirp-v3-5': 'chirp-v3-5',
  'chirp-v4': 'chirp-v4',
  'chirp-v4-5': 'chirp-v4-5',
  'chirp-v5': 'chirp-v5',
};

/**
 * Suno API 服务 (open.suno.cn 平台)
 * 提供AI音乐生成、歌词生成、音频上传和翻唱功能
 *
 * API 文档: https://open.suno.cn/
 */
class SunoService {
  private client: AxiosInstance;
  private baseURL: string;
  private accessKey: string;

  constructor() {
    this.baseURL = config.suno.baseURL;
    this.accessKey = config.suno.accessKey;

    // 创建axios实例 - 使用 Bearer Token 认证
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 60000, // 60秒超时
      headers: {
        'Authorization': `Bearer ${this.accessKey}`,
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器 - 添加日志
    this.client.interceptors.request.use(
      (config) => {
        logger.info('[Suno API] Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: this.sanitizeHeaders(config.headers),
        });
        return config;
      },
      (error) => {
        logger.error('[Suno API] Request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // 响应拦截器 - 处理错误和日志
    this.client.interceptors.response.use(
      (response) => {
        logger.info('[Suno API] Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * 清理敏感的请求头信息用于日志
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    if (sanitized.authorization) {
      sanitized.authorization = sanitized.authorization.substring(0, 20) + '...';
    }
    return sanitized;
  }

  /**
   * 处理API错误
   */
  private handleError(error: any): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      logger.error('[Suno API] Error response', {
        status,
        data,
        url: error.config?.url,
      });

      // 根据状态码返回相应的错误
      if (status === 401 || status === 403) {
        throw new SunoError(ErrorCode.SUNO_AUTH_FAILED, 'Suno API 认证失败', data);
      } else if (status === 429) {
        throw new SunoError(ErrorCode.SUNO_QUOTA_EXCEEDED, 'Suno API 配额已超限，请稍后再试', data);
      } else if (status && status >= 500) {
        throw new SunoError(ErrorCode.SUNO_GENERATION_FAILED, 'Suno API 服务异常', data);
      } else {
        throw new SunoError(ErrorCode.SUNO_GENERATION_FAILED, data?.message || 'Suno API 请求失败', data);
      }
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new SunoError(ErrorCode.SUNO_TIMEOUT, 'Suno API 请求超时', { originalError: error.message });
    }

    logger.error('[Suno API] Unknown error', { error: error.message });
    throw new SunoError(ErrorCode.SUNO_GENERATION_FAILED, '未知错误', { originalError: error.message });
  }

  /**
   * 灵感模式创建歌曲
   * @param prompt - 创作提示词
   * @param model - 模型类型 (默认 'chirp-v3-5')
   * @param instrumental - 是否为纯音乐
   * @returns 歌曲信息
   */
  async createWithPrompt(prompt: string, model: string = 'chirp-v3-5', instrumental: boolean = false): Promise<MusicInfo> {
    try {
      logger.info('[Suno Service] Creating music with prompt (inspiration mode)', {
        prompt: prompt.substring(0, 100),
        model,
        instrumental
      });

      // 转换模型版本格式
      const mv = MODEL_VERSION_MAP[model] || model;

      const response = await this.client.post('/api/v1/music/generate', {
        gpt_description_prompt: prompt,  // 灵感模式使用此参数
        mv,
        make_instrumental: instrumental,
      });

      return this.parseGenerateResponse(response.data);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 清理歌词格式，确保使用标准的英文结构标签
   * @param lyrics 原始歌词
   * @returns 清理后的歌词
   */
  private cleanLyrics(lyrics: string): string {
    // 中文结构标签到英文的映射
    const tagMappings: Record<string, string> = {
      '[前奏]': '[Intro]',
      '[间奏]': '[Interlude]',
      '[主歌]': '[Verse]',
      '[主歌一]': '[Verse 1]',
      '[主歌二]': '[Verse 2]',
      '[主歌三]': '[Verse 3]',
      '[副歌]': '[Chorus]',
      '[桥段]': '[Bridge]',
      '[尾奏]': '[Outro]',
      '[结尾]': '[Outro]',
      '[独白]': '[Spoken Word]',
    };

    let cleanedLyrics = lyrics;

    // 替换中文标签为英文
    for (const [chinese, english] of Object.entries(tagMappings)) {
      cleanedLyrics = cleanedLyrics.split(chinese).join(english);
    }

    // 删除括号中的描述性文字，如 (流行旋律缓缓升起)
    cleanedLyrics = cleanedLyrics.replace(/\([^)]*[\u4e00-\u9fa5]+[^)]*\)/g, '');

    // 清理多余的空行
    cleanedLyrics = cleanedLyrics.replace(/\n{3,}/g, '\n\n').trim();

    return cleanedLyrics;
  }

  /**
   * 自定义模式创建歌曲
   * @param params - 自定义参数
   * @returns 歌曲信息
   */
  async createCustom(params: {
    title?: string;
    lyrics?: string;
    tags?: string;
    description?: string;
    model?: string;
    instrumental?: boolean;
    continueAt?: string; // 续写位置（秒数）
    continueClipId?: string; // 续写clip ID
  }): Promise<MusicInfo> {
    try {
      logger.info('[Suno Service] Creating custom music', {
        title: params.title,
        tags: params.tags,
        model: params.model,
        instrumental: params.instrumental,
        hasLyrics: !!params.lyrics,
        lyricsLength: params.lyrics?.length || 0,
        lyricsPreview: params.lyrics?.substring(0, 200) || 'N/A',
      });

      // 转换模型版本格式
      const mv = MODEL_VERSION_MAP[params.model || 'chirp-v3-5'] || params.model || 'chirp-v3-5';

      const requestBody: any = {
        mv,
        make_instrumental: params.instrumental || false,
      };

      // 自定义模式：有歌词时使用 prompt 参数
      if (params.lyrics) {
        // 清理歌词格式
        const cleanedLyrics = this.cleanLyrics(params.lyrics);
        requestBody.prompt = cleanedLyrics;
        if (params.title) requestBody.title = params.title;
        if (params.tags) requestBody.tags = params.tags;
        logger.info('[Suno Service] Using CUSTOM mode with lyrics', {
          originalLyricsLength: params.lyrics.length,
          cleanedLyricsLength: cleanedLyrics.length,
          promptPreview: requestBody.prompt.substring(0, 300),
          title: requestBody.title,
          tags: requestBody.tags,
        });
      } else {
        // 没有歌词时使用灵感模式
        requestBody.gpt_description_prompt = params.description || params.tags || '';
        logger.info('[Suno Service] Using INSPIRATION mode (no lyrics)', {
          gpt_description_prompt: requestBody.gpt_description_prompt,
        });
      }

      // 续写模式
      if (params.continueClipId) {
        requestBody.task = 'extend';
        requestBody.continue_clip_id = params.continueClipId;
        if (params.continueAt) requestBody.continue_at = params.continueAt;
      }

      // Log the complete request body being sent to Suno API
      logger.info('[Suno Service] Sending request to Suno API /api/v1/music/generate', {
        requestBodyKeys: Object.keys(requestBody),
        requestBody: {
          ...requestBody,
          // Truncate prompt for logging
          prompt: requestBody.prompt ? `${requestBody.prompt.substring(0, 200)}... (${requestBody.prompt.length} chars)` : undefined,
        }
      });

      const response = await this.client.post('/api/v1/music/generate', requestBody);

      logger.info('[Suno Service] Response from Suno API', {
        status: response.status,
        data: response.data,
      });

      return this.parseGenerateResponse(response.data);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取歌曲详情
   * @param id - 任务ID (task_id)
   * @returns 歌曲信息
   */
  async getMusicById(id: string): Promise<MusicInfo> {
    try {
      logger.info('[Suno Service] Getting music by id', { id });

      const response = await this.client.get('/api/v1/music/task', {
        params: { id }
      });

      return this.parseTaskResponse(response.data);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 批量查询音乐任务
   * @param ids - 任务ID列表
   * @returns 歌曲信息列表
   */
  async getMusicByIds(ids: string[]): Promise<MusicInfo[]> {
    try {
      logger.info('[Suno Service] Getting music by ids', { ids: ids.join(',') });

      const response = await this.client.get('/api/v1/music/tasks', {
        params: {
          ids: ids.join(','),
          page: 1,
          size: ids.length
        }
      });

      const results: MusicInfo[] = [];
      const rows = response.data?.data?.rows || [];

      for (const row of rows) {
        results.push(this.parseTaskResponse({ code: 200, data: row }));
      }

      return results;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 查询积分余额
   * @returns 剩余积分
   */
  async getPointsBalance(): Promise<number> {
    try {
      const response = await this.client.get('/api/v1/points/balance');
      return response.data?.data?.remaining_points || 0;
    } catch (error) {
      logger.error('[Suno Service] Failed to get points balance', { error });
      return 0;
    }
  }

  /**
   * 生成歌词
   * @param prompt - 创作提示词
   * @returns 歌词结果
   */
  async generateLyrics(prompt: string): Promise<LyricsResult> {
    try {
      logger.info('[Suno Service] Generating lyrics', { prompt: prompt.substring(0, 100) });

      // 注意：Suno API 暂不提供独立的歌词生成接口
      // 这里我们返回一个基本的歌词模板，实际歌词会在音乐生成时由AI创建
      return {
        title: 'AI Generated Lyrics',
        lyrics: `[Verse 1]\n${prompt}\n\n[Chorus]\n基于您的描述生成的歌词...`,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 上传音频文件（用于翻唱）
   * @param audioUrl - 音频文件URL
   * @returns 上传后的任务ID
   */
  async uploadAudio(audioUrl: string): Promise<string> {
    try {
      logger.info('[Suno Service] Uploading audio', { audioUrl });

      const response = await this.client.post('/api/v1/music/upload', {
        audio_url: audioUrl
      });

      const taskId = response.data?.data;
      logger.info('[Suno Service] Audio upload task created', { taskId });

      return taskId;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 创建翻唱
   * @param params - 翻唱参数
   * @returns 歌曲信息
   */
  async createCover(params: {
    coverClipId: string; // 原歌曲的 custom_id
    prompt?: string; // 歌词（可选）
    tags?: string; // 风格标签
    model?: string; // 模型类型
  }): Promise<MusicInfo> {
    try {
      logger.info('[Suno Service] Creating cover', {
        coverClipId: params.coverClipId,
        tags: params.tags,
        model: params.model,
      });

      const mv = MODEL_VERSION_MAP[params.model || 'chirp-v3-5'] || params.model || 'chirp-v3-5';

      const response = await this.client.post('/api/v1/music/generate', {
        task: 'cover',
        cover_clip_id: params.coverClipId,
        prompt: params.prompt,
        tags: params.tags,
        mv,
      });

      return this.parseGenerateResponse(response.data);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取整首歌曲
   * @param clipId - Suno 音乐ID (custom_id)
   * @returns 任务ID
   */
  async getWholeSong(clipId: string): Promise<string> {
    try {
      logger.info('[Suno Service] Getting whole song', { clipId });

      const response = await this.client.post('/api/v1/music/whole-song', {
        clip_id: clipId
      });

      return response.data?.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取歌词时间戳对齐
   * @param sunoId - Suno音乐ID (custom_id)
   * @param lyrics - 歌词内容
   * @returns 任务ID
   */
  async getAlignedLyrics(sunoId: string, lyrics: string): Promise<string> {
    try {
      logger.info('[Suno Service] Getting aligned lyrics', { sunoId, lyricsLength: lyrics.length });

      const response = await this.client.post('/api/v1/music/aligned-lyrics', {
        suno_id: sunoId,
        lyrics
      });

      return response.data?.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remaster音乐 - 提升音质
   * @param clipId - Suno音乐ID (custom_id)
   * @param modelName - 模型名称：v5传chirp-carp, v4.5传chirp-bass, v4传chirp-up
   * @param variationCategory - 变化程度：subtle、normal或high (仅v5)
   * @returns 任务ID数组
   */
  async remasterMusic(clipId: string, modelName: string = 'chirp-v5', variationCategory?: 'subtle' | 'normal' | 'high'): Promise<string[]> {
    try {
      logger.info('[Suno Service] Remastering music', { clipId, modelName, variationCategory });

      const requestBody: any = {
        clip_id: clipId,
        model_name: modelName
      };

      if (variationCategory && modelName.includes('v5')) {
        requestBody.variation_category = variationCategory;
      }

      const response = await this.client.post('/api/v1/music/upsample', requestBody);

      return response.data?.data || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * 生成音乐视频
   * @param taskId - 任务ID
   * @param sunoId - Suno音乐ID (custom_id)
   * @returns 任务ID
   */
  async generateMusicVideo(taskId: string, sunoId: string): Promise<string> {
    try {
      logger.info('[Suno Service] Generating music video', { taskId, sunoId });

      const response = await this.client.post('/api/v1/music/video', {
        task_id: taskId,
        suno_id: sunoId
      });

      return response.data?.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 转WAV格式
   * @param taskId - 任务ID
   * @param sunoId - Suno音乐ID (custom_id)
   * @returns 任务ID
   */
  async convertToWav(taskId: string, sunoId: string): Promise<string> {
    try {
      logger.info('[Suno Service] Converting to WAV', { taskId, sunoId });

      const response = await this.client.post('/api/v1/music/convert-wav', {
        task_id: taskId,
        suno_id: sunoId
      });

      return response.data?.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 裁剪音乐
   * @param clipId - Suno音乐ID (custom_id)
   * @param cropStartS - 裁剪开始时间（秒）
   * @param cropEndS - 裁剪结束时间（秒）
   * @returns 任务ID
   */
  async cropMusic(clipId: string, cropStartS: number, cropEndS: number): Promise<string> {
    try {
      logger.info('[Suno Service] Cropping music', { clipId, cropStartS, cropEndS });

      const response = await this.client.post('/api/v1/music/crop', {
        clip_id: clipId,
        crop_start_s: cropStartS,
        crop_end_s: cropEndS
      });

      return response.data?.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 调整音乐速度
   * @param clipId - Suno音乐ID (custom_id)
   * @param speedMultiplier - 速度倍数：0.25, 0.5, 0.75, 1, 1.25, 1.5, 2
   * @param keepPitch - 是否保持高音
   * @param title - 歌名
   * @returns 任务ID
   */
  async adjustSpeed(clipId: string, speedMultiplier: number, keepPitch: boolean = false, title?: string): Promise<string> {
    try {
      logger.info('[Suno Service] Adjusting music speed', { clipId, speedMultiplier, keepPitch, title });

      const validSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
      if (!validSpeeds.includes(speedMultiplier)) {
        throw new SunoError(ErrorCode.INVALID_PARAMS, `无效的速度倍数，支持: ${validSpeeds.join(', ')}`, {});
      }

      const requestBody: any = {
        clip_id: clipId,
        speed_multiplier: speedMultiplier,
        keep_pitch: keepPitch
      };

      if (title) {
        requestBody.title = title;
      }

      const response = await this.client.post('/api/v1/music/speed', requestBody);

      return response.data?.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 轮询等待生成完成
   * @param id - 任务ID
   * @param maxWait - 最大等待时间（秒），默认300秒（5分钟）
   * @param interval - 轮询间隔（毫秒），默认3000毫秒（3秒）
   * @returns 完成的歌曲信息
   */
  async waitForCompletion(
    id: string,
    maxWait: number = 300,
    interval: number = 3000
  ): Promise<MusicInfo> {
    const startTime = Date.now();
    const maxWaitMs = maxWait * 1000;

    logger.info('[Suno Service] Waiting for completion', { id, maxWait, interval });

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const music = await this.getMusicById(id);

        // 状态: 1=排队中, 2=生成中, 3=成功, 4=失败
        if (music.status === 'complete') {
          logger.info('[Suno Service] Generation completed', { id });
          return music;
        }

        if (music.status === 'error') {
          throw new SunoError(
            ErrorCode.SUNO_GENERATION_FAILED,
            `歌曲生成失败: ${id}`,
            music
          );
        }

        // 继续等待
        logger.debug('[Suno Service] Still processing', {
          id,
          status: music.status,
          elapsed: Math.floor((Date.now() - startTime) / 1000),
        });

        await this.sleep(interval);
      } catch (error) {
        // 如果是SunoError，直接抛出
        if (error instanceof SunoError) {
          throw error;
        }
        // 其他错误记录日志后继续轮询
        logger.warn('[Suno Service] Error during polling, retrying...', {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.sleep(interval);
      }
    }

    // 超时
    throw new SunoError(
      ErrorCode.SUNO_TIMEOUT,
      `等待歌曲生成超时: ${id}`,
      { waited: Math.floor((Date.now() - startTime) / 1000), maxWait }
    );
  }

  /**
   * 解析生成音乐响应
   * 生成接口返回: { code: 200, data: [task_id_1, task_id_2], success: true }
   */
  private parseGenerateResponse(data: any): MusicInfo {
    if (data.code !== 200 || !data.success) {
      throw new SunoError(
        ErrorCode.SUNO_GENERATION_FAILED,
        data.message || '音乐生成请求失败',
        data
      );
    }

    // data 是任务ID数组，包含2个ID（一次生成两首歌）
    const taskIds = data.data || [];
    const primaryTaskId = Array.isArray(taskIds) ? taskIds[0] : taskIds;

    return {
      id: String(primaryTaskId),
      status: 'processing',
      title: '',
      audio_url: '',
      video_url: '',
      image_url: '',
      duration: 0,
      lyrics: '',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * 解析查询任务响应
   * 查询接口返回状态: 1=排队中, 2=生成中, 3=成功, 4=失败
   */
  private parseTaskResponse(data: any): MusicInfo {
    const taskData = data.data || data;

    if (data.code !== 200) {
      return {
        id: String(taskData.id || ''),
        status: 'error',
        title: '',
        audio_url: '',
        video_url: '',
        image_url: '',
        duration: 0,
        lyrics: '',
        created_at: new Date().toISOString(),
      };
    }

    // 状态转换: 1=排队中, 2=生成中, 3=成功, 4=失败
    const statusMap: Record<number, MusicStatus> = {
      1: 'processing', // 排队中
      2: 'processing', // 生成中
      3: 'complete',   // 成功
      4: 'error',      // 失败
    };

    const status = statusMap[taskData.status] || 'processing';

    const fileInfo = taskData.fileInfo || {};

    return {
      id: String(taskData.id || ''),
      status,
      title: taskData.title || '',
      audio_url: fileInfo.mp3Url || taskData.audio_url || '',
      video_url: fileInfo.mp4Url || taskData.video_url || '',
      image_url: fileInfo.coverUrl || taskData.image_url || taskData.coverImageUrl || '',
      duration: taskData.duration || 0,
      lyrics: taskData.lyrics || '',
      created_at: taskData.created_at || taskData.createTime || new Date().toISOString(),
    };
  }

  /**
   * 解析旧版响应数据（兼容）
   */
  private parseMusicResponse(data: any): MusicInfo {
    const musicData = data.data || data;

    return {
      id: musicData.id || musicData.music_id || musicData.jobId || '',
      status: this.parseStatus(musicData.status),
      title: musicData.title || musicData.name || '',
      audio_url: musicData.audio_url || musicData.audioUrl || musicData.audio || '',
      video_url: musicData.video_url || musicData.videoUrl || musicData.video || '',
      image_url: musicData.image_url || musicData.imageUrl || musicData.image || musicData.coverImageUrl || '',
      duration: musicData.duration || musicData.length || 0,
      lyrics: musicData.lyrics || '',
      created_at: musicData.created_at || musicData.createdAt || musicData.createTime || new Date().toISOString(),
    };
  }

  /**
   * 解析状态值
   */
  private parseStatus(status: string | number): MusicStatus {
    if (!status) return 'processing';

    // 数字状态
    if (typeof status === 'number') {
      const statusMap: Record<number, MusicStatus> = {
        1: 'processing',
        2: 'processing',
        3: 'complete',
        4: 'error',
      };
      return statusMap[status] || 'processing';
    }

    // 字符串状态
    const normalizedStatus = String(status).toLowerCase();

    if (normalizedStatus === 'complete' || normalizedStatus === 'completed' || normalizedStatus === 'success' || normalizedStatus === '3') {
      return 'complete';
    }

    if (normalizedStatus === 'error' || normalizedStatus === 'failed' || normalizedStatus === 'failure' || normalizedStatus === '4') {
      return 'error';
    }

    return 'processing';
  }

  /**
   * 休眠工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出单例
export default new SunoService();

// 同时导出类类型以便测试
export { SunoService };

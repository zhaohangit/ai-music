import { LLMProvider, LyricsResult, StyleRecommendation, MusicInfo } from '../types/errors';
import LLMSelector from './llmSelector';
import config from '../config';
import logger from '../utils/logger';
import glmService from './glmService';
import joyBuilderService from './joyBuilderService';

// 服务接口
interface ILlmService {
  generateLyrics(userIdea: string, style: string, mood: string): Promise<LyricsResult>;
  enhancePrompt(userInput: string): Promise<string>;
  recommendStyle?(description: string): Promise<StyleRecommendation>;
  polishLyrics?(rawLyrics: string, style: string): Promise<string>;
  isServiceAvailable?(): boolean;
}

interface IMusicService {
  createWithPrompt(prompt: string, model?: string, instrumental?: boolean): Promise<any>;
  createCustom(params: any): Promise<any>;
  getMusicById(id: string): Promise<any>;
  waitForCompletion(id: string, maxWait?: number, interval?: number): Promise<any>;
}

/**
 * 音乐生成编排服务
 * 整合LLM和音乐生成服务
 *
 * 支持的LLM服务：
 * - JoyBuilder (京东内部): DeepSeek-V3.2, Qwen3-8B, DeepSeek-R1
 * - GLM (智谱): glm-5, glm-4-flash
 */
export class MusicOrchestrator {
  private llmProvider: LLMProvider;
  private glmService: ILlmService | null = null;
  private joyBuilderService: ILlmService | null = null;
  private sunoService: IMusicService | null = null;

  constructor() {
    // 根据环境自动选择LLM
    this.llmProvider = LLMSelector.getDefaultProvider();

    // 自动注入已导入的服务
    this.glmService = glmService;
    this.joyBuilderService = joyBuilderService;

    logger.info('MusicOrchestrator initialized', {
      llmProvider: this.llmProvider,
      glmAvailable: LLMSelector.isGLMAvailable(),
      joyBuilderAvailable: LLMSelector.isJoyBuilderAvailable()
    });
  }

  /**
   * 设置LLM服务（向后兼容）
   */
  setLlmService(service: ILlmService) {
    this.glmService = service;
    logger.info('LLM service set', { type: 'glm' });
  }

  /**
   * 设置JoyBuilder服务
   */
  setJoyBuilderService(service: ILlmService) {
    this.joyBuilderService = service;
    logger.info('JoyBuilder service set');
  }

  /**
   * 设置音乐服务
   */
  setMusicService(service: IMusicService) {
    this.sunoService = service;
    logger.info('Music service set');
  }

  /**
   * 根据提供商获取对应的LLM服务
   */
  private getLLMService(provider?: LLMProvider): ILlmService {
    const activeProvider = provider || this.llmProvider;

    if (activeProvider === LLMProvider.JOYBUILDER) {
      if (this.joyBuilderService && this.joyBuilderService.isServiceAvailable?.()) {
        return this.joyBuilderService;
      }
      logger.warn('JoyBuilder not available, falling back to GLM');
    }

    if (this.glmService) {
      return this.glmService;
    }

    throw new Error('No LLM service available');
  }

  /**
   * 获取当前可用的LLM服务
   */
  private getActiveLLMService(): { service: ILlmService; provider: LLMProvider } {
    // 尝试使用首选提供商
    if (this.llmProvider === LLMProvider.JOYBUILDER && this.joyBuilderService?.isServiceAvailable?.()) {
      return { service: this.joyBuilderService, provider: LLMProvider.JOYBUILDER };
    }

    // 回退到GLM
    if (this.glmService) {
      return { service: this.glmService, provider: LLMProvider.GLM };
    }

    // 最后尝试JoyBuilder（即使不可用也返回，让错误信息更明确）
    if (this.joyBuilderService) {
      return { service: this.joyBuilderService, provider: LLMProvider.JOYBUILDER };
    }

    throw new Error('No LLM service configured');
  }

  /**
   * 智能音乐生成流程
   * 1. LLM分析用户意图并生成歌词
   * 2. Suno根据歌词和风格生成音乐
   */
  async createMusicWithAI(params: {
    idea: string;
    style?: string;
    mood?: string;
    mode: 'full_ai' | 'lyrics_only' | 'music_only' | 'inspiration' | 'custom';
    llmProvider?: LLMProvider;
    title?: string;
    lyrics?: string;
    tags?: string;
    instrumental?: boolean;
    mv?: string;
  }): Promise<{
    taskId?: string;
    title: string;
    lyrics: string;
    style: string[];
    mood: string;
    llmUsed: LLMProvider;
    status: string;
  }> {
    const { idea, style, mood, mode, llmProvider, title, lyrics, tags, instrumental, mv } = params;

    // 获取活跃的LLM服务
    const { service: llmService, provider: activeProvider } = this.getActiveLLMService();

    let finalLyrics = lyrics || '';
    let finalTitle = title || 'AI Generated Song';
    let enhancedPrompt = idea;
    let recommendedTags: string[] = tags ? tags.split(',').map(t => t.trim()) : [];
    let detectedMood = mood || '温暖';

    logger.info('Starting music creation', {
      mode,
      provider: activeProvider,
      idea: idea.substring(0, 50)
    });

    // 步骤1：分析并推荐风格（如果用户未指定）
    if (!style && recommendedTags.length === 0) {
      try {
        if (llmService.recommendStyle) {
          const recommendation = await llmService.recommendStyle(idea);
          recommendedTags = recommendation.tags;
          detectedMood = recommendation.mood;
          logger.info('Style recommended', { tags: recommendedTags, mood: detectedMood });
        }
      } catch (error) {
        logger.warn('Style recommendation failed, using defaults', { error });
        recommendedTags = ['流行'];
      }
    } else if (tags) {
      recommendedTags = tags.split(',').map(t => t.trim());
    }

    // 步骤2：生成或增强歌词
    if (mode === 'full_ai' || mode === 'lyrics_only') {
      if (!lyrics) {
        try {
          const lyricsResult = await llmService.generateLyrics(
            idea,
            style || recommendedTags.join(','),
            detectedMood
          );
          finalLyrics = lyricsResult.lyrics;
          finalTitle = lyricsResult.title;
          logger.info('Lyrics generated', { title: finalTitle, length: finalLyrics.length });
        } catch (error) {
          logger.error('Lyrics generation failed', { error });
          throw error;
        }
      }

      // 使用LLM增强prompt
      try {
        enhancedPrompt = await llmService.enhancePrompt(idea);
        logger.info('Prompt enhanced', { originalLength: idea.length, enhancedLength: enhancedPrompt.length });
      } catch (error) {
        logger.warn('Prompt enhancement failed, using original', { error });
        enhancedPrompt = idea;
      }
    }

    // 步骤3：调用Suno生成音乐
    if ((mode === 'full_ai' || mode === 'music_only' || mode === 'inspiration') && this.sunoService) {
      try {
        let musicResult;

        if (mode === 'inspiration') {
          // 灵感模式
          musicResult = await this.sunoService.createWithPrompt(enhancedPrompt, mv, instrumental);
        } else {
          // 自定义模式
          musicResult = await this.sunoService.createCustom({
            title: finalTitle,
            lyrics: finalLyrics,
            tags: style || recommendedTags.join(','),
            mv: mv || 'chirp-v3-5',
            instrumental
          });
        }

        const taskId = musicResult?.id || musicResult?.data?.id;
        logger.info('Music generation started', { taskId });

        return {
          taskId,
          title: finalTitle,
          lyrics: finalLyrics,
          style: recommendedTags,
          mood: detectedMood,
          llmUsed: activeProvider,
          status: 'processing'
        };
      } catch (error) {
        logger.error('Music generation failed', { error });
        throw error;
      }
    }

    return {
      title: finalTitle,
      lyrics: finalLyrics,
      style: recommendedTags,
      mood: detectedMood,
      llmUsed: activeProvider,
      status: 'lyrics_only'
    };
  }

  /**
   * 查询音乐生成状态
   */
  async getMusicStatus(taskId: string): Promise<MusicInfo> {
    if (!this.sunoService) {
      throw new Error('Music service not initialized');
    }

    const result = await this.sunoService.getMusicById(taskId);
    return result;
  }

  /**
   * 等待音乐生成完成
   */
  async waitForMusicCompletion(taskId: string, maxWait = 300000): Promise<MusicInfo> {
    if (!this.sunoService) {
      throw new Error('Music service not initialized');
    }

    return await this.sunoService.waitForCompletion(taskId, maxWait);
  }

  /**
   * 歌词润色
   */
  async polishLyrics(rawLyrics: string, style: string, provider?: LLMProvider): Promise<string> {
    const { service: llmService } = provider
      ? { service: this.getLLMService(provider) }
      : this.getActiveLLMService();

    if (llmService.polishLyrics) {
      return await llmService.polishLyrics(rawLyrics, style);
    }

    // 如果服务不支持润色，直接返回原文
    return rawLyrics;
  }

  /**
   * 使用指定LLM生成歌词
   */
  async generateLyricsWithProvider(
    idea: string,
    style: string,
    mood: string,
    provider?: LLMProvider
  ): Promise<LyricsResult> {
    const { service: llmService, provider: activeProvider } = provider
      ? { service: this.getLLMService(provider), provider }
      : this.getActiveLLMService();

    logger.info('Generating lyrics', { provider: activeProvider });

    return await llmService.generateLyrics(idea, style, mood);
  }

  /**
   * 获取当前配置信息
   */
  getConfigInfo() {
    return {
      defaultProvider: this.llmProvider,
      glmAvailable: LLMSelector.isGLMAvailable(),
      joyBuilderAvailable: LLMSelector.isJoyBuilderAvailable(),
      statusSummary: LLMSelector.getStatusSummary()
    };
  }
}

// 单例导出
export const musicOrchestrator = new MusicOrchestrator();
export default musicOrchestrator;

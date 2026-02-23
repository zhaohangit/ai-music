import { LLMProvider, LyricsResult, StyleRecommendation, MusicInfo } from '../types/errors';
import LLMSelector from './llmSelector';
import config from '../config';
import logger from '../utils/logger';

// 服务接口
interface ILlmService {
  generateLyrics(userIdea: string, style: string, mood: string): Promise<LyricsResult>;
  enhancePrompt(userInput: string): Promise<string>;
  recommendStyle?(description: string): Promise<StyleRecommendation>;
  polishLyrics?(rawLyrics: string, style: string): Promise<string>;
}

interface IMusicService {
  createWithPrompt(prompt: string, model?: string): Promise<any>;
  createCustom(params: any): Promise<any>;
  getMusicById(id: string): Promise<any>;
  waitForCompletion(id: string, maxWait?: number, interval?: number): Promise<any>;
}

/**
 * 音乐生成编排服务
 * 整合LLM和音乐生成服务
 */
export class MusicOrchestrator {
  private llmProvider: LLMProvider;
  private glmService: ILlmService | null = null;
  private sunoService: IMusicService | null = null;

  constructor() {
    // 根据环境自动选择LLM
    this.llmProvider = LLMSelector.getDefaultProvider();
    logger.info('MusicOrchestrator initialized', { llmProvider: this.llmProvider });
  }

  /**
   * 设置LLM服务
   */
  setLlmService(service: ILlmService) {
    this.glmService = service;
  }

  /**
   * 设置音乐服务
   */
  setMusicService(service: IMusicService) {
    this.sunoService = service;
  }

  /**
   * 获取当前LLM服务
   */
  private getLLMService(): ILlmService {
    if (!this.glmService) {
      throw new Error('LLM service not initialized');
    }
    return this.glmService;
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
  }): Promise<{
    taskId?: string;
    title: string;
    lyrics: string;
    style: string[];
    mood: string;
    llmUsed: LLMProvider;
    status: string;
  }> {
    const { idea, style, mood, mode, llmProvider, title, lyrics, tags } = params;

    // 如果指定了LLM，临时切换
    const activeProvider = llmProvider || this.llmProvider;
    const llmService = this.getLLMService();

    let finalLyrics = lyrics || '';
    let finalTitle = title || 'AI Generated Song';
    let enhancedPrompt = idea;
    let recommendedTags: string[] = tags ? tags.split(',') : [];
    let detectedMood = mood || '温暖';

    logger.info('Starting music creation', {
      mode,
      provider: activeProvider,
      idea: idea.substring(0, 50)
    });

    // 步骤1：分析并推荐风格（如果用户未指定）
    if (!style && !tags) {
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
          logger.info('Lyrics generated', { title: finalTitle });
        } catch (error) {
          logger.error('Lyrics generation failed', { error });
          throw error;
        }
      }

      // 使用LLM增强prompt
      try {
        enhancedPrompt = await llmService.enhancePrompt(idea);
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
          musicResult = await this.sunoService.createWithPrompt(enhancedPrompt);
        } else {
          // 自定义模式
          musicResult = await this.sunoService.createCustom({
            title: finalTitle,
            lyrics: finalLyrics,
            tags: style || recommendedTags.join(','),
            mv: 'chirp-v3-5'
          });
        }

        logger.info('Music generation started', { taskId: musicResult?.data?.id });

        return {
          taskId: musicResult?.data?.id,
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
    return result.data;
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
   * 歌词润色（使用GLM的高级能力）
   */
  async polishLyrics(rawLyrics: string, style: string): Promise<string> {
    const llmService = this.getLLMService();

    if (llmService.polishLyrics) {
      return await llmService.polishLyrics(rawLyrics, style);
    }

    // 如果服务不支持润色，直接返回原文
    return rawLyrics;
  }
}

// 单例导出
export const musicOrchestrator = new MusicOrchestrator();
export default musicOrchestrator;

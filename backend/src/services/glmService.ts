import axios, { AxiosInstance } from 'axios';
import config from '../config';
import logger from '../utils/logger';
import { LLMError, ErrorCode, LyricsResult, StyleRecommendation } from '../types/errors';

/**
 * GLM API响应类型
 */
interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GLMRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface GLMChatResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GLMErrorResponse {
  error?: {
    code?: string | number;
    message?: string;
    type?: string;
  };
}

/**
 * GLM API服务类
 * 提供歌词生成、风格增强、歌词润色、风格推荐等功能
 */
class GLMService {
  private client: AxiosInstance;
  private baseURL: string;
  private authorization: string;
  private models: {
    creative: string;
    fast: string;
  };

  constructor() {
    this.baseURL = config.glm.baseURL;
    this.authorization = config.glm.authorization;
    this.models = config.glm.models;

    // 创建axios实例
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 60000, // 60秒超时
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authorization}`,
      },
    });

    // 请求拦截器 - 记录请求
    this.client.interceptors.request.use(
      (config) => {
        logger.info('GLM API请求', {
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data ? { ...config.data, messages: '[REDACTED]' } : undefined,
        });
        return config;
      },
      (error) => {
        logger.error('GLM API请求错误', { error: error.message });
        return Promise.reject(error);
      }
    );

    // 响应拦截器 - 记录响应和处理错误
    this.client.interceptors.response.use(
      (response) => {
        logger.info('GLM API响应', {
          status: response.status,
          usage: response.data?.usage,
        });
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );

    logger.info('GLM服务初始化完成', {
      baseURL: this.baseURL,
      hasAuth: !!this.authorization,
      models: this.models,
    });
  }

  /**
   * 处理API错误
   */
  private handleError(error: any): void {
    let errorCode = ErrorCode.LLM_GENERATION_FAILED;
    let errorMessage = 'GLM API调用失败';

    if (error.response) {
      const status = error.response.status;
      const data: GLMErrorResponse = error.response.data;

      if (status === 401 || status === 403) {
        errorCode = ErrorCode.LLM_AUTH_FAILED;
        errorMessage = data?.error?.message || 'GLM API认证失败，请检查Authorization';
      } else if (status === 429) {
        errorCode = ErrorCode.RATE_LIMIT;
        errorMessage = 'GLM API请求频率超限';
      } else if (status === 408 || error.code === 'ECONNABORTED') {
        errorCode = ErrorCode.LLM_TIMEOUT;
        errorMessage = 'GLM API请求超时';
      } else if (data?.error?.message) {
        errorMessage = data.error.message;
      }

      logger.error('GLM API错误响应', {
        status,
        errorCode,
        errorMessage,
        data: error.response.data,
      });
    } else if (error.request) {
      errorCode = ErrorCode.LLM_TIMEOUT;
      errorMessage = 'GLM API无响应，请检查网络连接';
      logger.error('GLM API无响应', { error: error.message });
    } else {
      logger.error('GLM API请求配置错误', { error: error.message });
    }

    throw new LLMError(errorCode, errorMessage, {
      originalError: error.message,
    });
  }

  /**
   * 调用GLM聊天完成API
   */
  private async chat(
    messages: GLMMessage[],
    options: GLMRequestOptions = {}
  ): Promise<string> {
    const {
      model = this.models.creative,
      temperature = 0.8,
      maxTokens = 2000,
    } = options;

    try {
      const response = await this.client.post<GLMChatResponse>('/chat/completions', {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new LLMError(
          ErrorCode.LLM_GENERATION_FAILED,
          'GLM API返回了空内容',
          { response: response.data }
        );
      }

      return content;
    } catch (error) {
      // 已在拦截器中处理
      throw error;
    }
  }

  /**
   * 安全解析JSON字符串
   */
  private safeJsonParse<T>(text: string, fallback?: T): T | null {
    // 预处理：去除首尾空白
    let cleanedText = text.trim();

    logger.debug('safeJsonParse 开始解析', {
      textLength: cleanedText.length,
      first100Chars: cleanedText.substring(0, 100),
      last100Chars: cleanedText.substring(cleanedText.length - 100)
    });

    try {
      // 尝试直接解析
      const result = JSON.parse(cleanedText) as T;
      logger.debug('safeJsonParse 直接解析成功');
      return result;
    } catch (directError) {
      logger.debug('safeJsonParse 直接解析失败', { error: String(directError) });

      // 尝试提取JSON代码块
      const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[1].trim()) as T;
          logger.debug('safeJsonParse 代码块解析成功');
          return result;
        } catch {
          logger.debug('safeJsonParse 代码块解析失败');
        }
      }

      // 尝试提取花括号内容 - 使用更精确的正则
      const braceMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          let jsonStr = braceMatch[0];
          // 尝试修复常见的JSON格式问题
          // 1. 确保字符串中的换行符被正确转义
          jsonStr = this.fixJsonString(jsonStr);
          const result = JSON.parse(jsonStr) as T;
          logger.debug('safeJsonParse 花括号提取解析成功');
          return result;
        } catch (braceError) {
          logger.debug('safeJsonParse 花括号提取解析失败', { error: String(braceError) });
        }
      }

      // 尝试查找第一个 { 和最后一个 } 之间的内容
      const firstBrace = cleanedText.indexOf('{');
      const lastBrace = cleanedText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          let jsonStr = cleanedText.substring(firstBrace, lastBrace + 1);
          jsonStr = this.fixJsonString(jsonStr);
          const result = JSON.parse(jsonStr) as T;
          logger.debug('safeJsonParse 位置提取解析成功');
          return result;
        } catch (posError) {
          logger.debug('safeJsonParse 位置提取解析失败', { error: String(posError) });
        }
      }

      logger.warn('safeJsonParse 所有解析方法均失败', {
        textPreview: cleanedText.substring(0, 500)
      });

      if (fallback !== undefined) {
        return fallback;
      }
      return null;
    }
  }

  /**
   * 修复JSON字符串中的格式问题
   * 主要处理LLM返回的JSON中字符串值包含未转义换行符的问题
   */
  private fixJsonString(jsonStr: string): string {
    // 这个函数处理LLM返回的JSON中可能存在的问题
    // GLM有时会返回包含未转义换行符的JSON字符串，这是无效的JSON格式

    // 方法：逐字符解析，跟踪是否在字符串内部，转义字符串内的换行符
    let result = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];
      const nextChar = jsonStr[i + 1];

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      // 处理字符串内部的换行符 - 需要转义
      if (inString) {
        if (char === '\n') {
          result += '\\n';
          continue;
        }
        if (char === '\r') {
          result += '\\r';
          continue;
        }
        if (char === '\t') {
          result += '\\t';
          continue;
        }
        // 移除其他控制字符
        if (char.charCodeAt(0) < 32 && char !== '\n' && char !== '\r' && char !== '\t') {
          continue;
        }
      }

      result += char;
    }

    return result;
  }

  /**
   * 生成歌词
   * @param userIdea 用户创意描述
   * @param style 音乐风格
   * @param mood 情绪基调
   * @returns 歌词结果，包含标题和歌词内容
   */
  async generateLyrics(
    userIdea: string,
    style: string,
    mood: string
  ): Promise<LyricsResult> {
    logger.info('开始生成歌词', { userIdea, style, mood });

    const systemPrompt = `你是一位专业的歌词创作专家。你的任务是根据用户提供的创意、风格和情绪，创作出优美的歌词。

要求：
1. 歌词必须使用标准的英文歌曲结构标签（这是Suno API要求的格式）：
   - [Intro] - 前奏
   - [Verse], [Verse 1], [Verse 2] 等 - 主歌
   - [Chorus] - 副歌
   - [Bridge] - 桥段
   - [Outro] - 尾奏
2. 歌词内容必须使用中文（除非用户明确要求英文）
3. 歌曲标题必须使用中文
4. 不要在歌词中添加括号说明，如 (流行旋律缓缓响起) 这样的描述要删除
5. 歌词要符合指定的音乐风格
6. 歌词要准确表达指定的情绪
7. 歌词要有押韵和节奏感
8. 返回格式必须是纯JSON，格式如下：
{
  "title": "中文歌曲标题",
  "lyrics": "完整的中文歌词内容，使用英文结构标签"
}

重要：歌词和标题必须使用中文！结构标签必须使用英文！只返回JSON，不要有其他说明文字。`;

    const userPrompt = `请根据以下信息创作歌词：

用户创意：${userIdea}
音乐风格：${style}
情绪基调：${mood}

请创作一首完整的中文歌词，标题也要用中文。`;

    try {
      const response = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.9, maxTokens: 2000 }
      );

      logger.debug('GLM原始响应', {
        responseLength: response.length,
        responsePreview: response.substring(0, 300),
        responseEnd: response.substring(response.length - 100)
      });

      const result = this.safeJsonParse<LyricsResult>(response);

      if (!result) {
        logger.error('JSON解析返回null', { response });
        throw new LLMError(
          ErrorCode.LLM_GENERATION_FAILED,
          '歌词生成结果JSON解析失败',
          { response: response.substring(0, 500) }
        );
      }

      logger.debug('JSON解析结果', {
        hasTitle: !!result.title,
        hasLyrics: !!result.lyrics,
        titleValue: result.title,
        lyricsLength: result.lyrics?.length
      });

      if (!result.title || !result.lyrics) {
        throw new LLMError(
          ErrorCode.LLM_GENERATION_FAILED,
          '歌词生成结果格式不正确：缺少title或lyrics字段',
          {
            hasTitle: !!result.title,
            hasLyrics: !!result.lyrics,
            result: JSON.stringify(result).substring(0, 500)
          }
        );
      }

      logger.info('歌词生成成功', { title: result.title, lyricsLength: result.lyrics.length });
      return result;
    } catch (error) {
      logger.error('歌词生成失败', { error });
      throw error;
    }
  }

  /**
   * 增强用户输入的prompt
   * @param userInput 用户原始输入
   * @returns 增强后的详细音乐提示词
   */
  async enhancePrompt(userInput: string): Promise<string> {
    logger.info('开始增强prompt', { userInput });

    const systemPrompt = `你是一位专业的音乐提示词专家。你的任务是将用户简单的描述扩展为详细、专业的音乐生成提示词。

要求：
1. 保留用户原意，但添加更多音乐相关的细节
2. 包含乐器、编曲、音色、节奏等具体描述
3. 描述要生动具体，有助于AI音乐生成
4. 返回纯文本，不要有JSON格式或其他标记
5. 长度控制在100-200字之间`;

    const userPrompt = `请将以下用户描述扩展为详细的音乐提示词：

用户描述：${userInput}

请生成专业的音乐提示词。`;

    try {
      const enhancedPrompt = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.7, maxTokens: 500 }
      );

      // 清理可能的代码块标记
      const cleanedPrompt = enhancedPrompt
        .replace(/```[\w]*\n?/g, '')
        .trim();

      logger.info('Prompt增强成功', { originalLength: userInput.length, enhancedLength: cleanedPrompt.length });
      return cleanedPrompt;
    } catch (error) {
      logger.error('Prompt增强失败', { error });
      throw error;
    }
  }

  /**
   * 润色和优化歌词
   * @param rawLyrics 原始歌词
   * @param style 音乐风格
   * @returns 润色后的歌词
   */
  async polishLyrics(rawLyrics: string, style: string): Promise<string> {
    logger.info('开始润色歌词', { rawLyricsLength: rawLyrics.length, style });

    const systemPrompt = `你是一位专业的歌词润色专家。你的任务是在保持原意和情感的基础上，优化歌词的押韵、节奏和表达。

要求：
1. 保持原有的情感核心和主题
2. 优化押韵，使歌词更朗朗上口
3. 改善节奏感，使歌词更易于演唱
4. 必须保持使用英文歌曲结构标签：[Intro], [Verse], [Chorus], [Bridge], [Outro]
5. 删除歌词中的括号说明，如 (流行旋律缓缓升起) 这样的描述
6. 如果原歌词使用中文标签如[前奏]、[主歌]，必须转换为对应的英文标签
7. 符合指定的音乐风格特点
8. 只返回润色后的歌词，不要有其他说明`;

    const userPrompt = `请润色以下歌词，风格为：${style}

原始歌词：
${rawLyrics}

请返回润色后的完整歌词。`;

    try {
      const polishedLyrics = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.8, maxTokens: 2000 }
      );

      // 清理可能的代码块标记
      const cleanedLyrics = polishedLyrics
        .replace(/```[\w]*\n?/g, '')
        .trim();

      logger.info('歌词润色成功', { polishedLength: cleanedLyrics.length });
      return cleanedLyrics;
    } catch (error) {
      logger.error('歌词润色失败', { error });
      throw error;
    }
  }

  /**
   * 推荐音乐风格
   * @param description 用户描述
   * @returns 风格推荐结果
   */
  async recommendStyle(description: string): Promise<StyleRecommendation> {
    logger.info('开始推荐风格', { description });

    const systemPrompt = `你是一位音乐风格分析专家。你的任务是根据用户的描述，推荐合适的音乐风格标签、情绪和节奏。

要求：
1. 分析用户描述中的情感倾向和音乐偏好
2. 返回纯JSON格式，不要有其他文字
3. JSON格式如下：
{
  "tags": ["风格标签1", "风格标签2", "风格标签3"],
  "mood": "情绪描述",
  "tempo": "节奏描述（如：快速、中等、缓慢）"
}

风格标签参考：
- 流派：pop, rock, electronic, jazz, classical, folk, hip-hop, r&b, country, reggae
- 乐器：piano, guitar, drums, violin, synth, orchestral
- 主题：love, breakup, party, chill, motivational, sad, happy
- 时代：80s, 90s, 2000s, modern, vintage

情绪参考：
- happy, sad, energetic, calm, romantic, melancholic, hopeful, angry

节奏参考：
- 快速 (fast, 120+ BPM)
- 中等 (medium, 90-120 BPM)
- 缓慢 (slow, <90 BPM)`;

    const userPrompt = `根据以下描述推荐音乐风格：

用户描述：${description}

请分析并返回JSON格式的风格推荐。`;

    try {
      const response = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.6, maxTokens: 500 }
      );

      const recommendation = this.safeJsonParse<StyleRecommendation>(response);
      if (!recommendation || !recommendation.tags || !recommendation.mood || !recommendation.tempo) {
        throw new LLMError(
          ErrorCode.LLM_GENERATION_FAILED,
          '风格推荐结果格式不正确',
          { response }
        );
      }

      logger.info('风格推荐成功', recommendation);
      return recommendation;
    } catch (error) {
      logger.error('风格推荐失败', { error });
      throw error;
    }
  }

  /**
   * 使用快速模型进行简单文本生成
   * @param prompt 输入提示
   * @returns 生成的文本
   */
  async quickGenerate(prompt: string): Promise<string> {
    logger.info('快速文本生成', { promptLength: prompt.length });

    try {
      const response = await this.chat(
        [
          { role: 'user', content: prompt },
        ],
        { model: this.models.fast, temperature: 0.7, maxTokens: 1000 }
      );

      logger.info('快速生成成功', { responseLength: response.length });
      return response;
    } catch (error) {
      logger.error('快速生成失败', { error });
      throw error;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.chat(
        [{ role: 'user', content: 'Hello' }],
        { model: this.models.fast, temperature: 0.1, maxTokens: 10 }
      );
      return !!response;
    } catch (error) {
      logger.error('GLM服务健康检查失败', { error });
      return false;
    }
  }

  /**
   * 获取服务配置信息
   */
  getConfigInfo() {
    return {
      baseURL: this.baseURL,
      hasAuth: !!this.authorization,
      models: this.models,
    };
  }
}

// 导出单例
export const glmService = new GLMService();
export default glmService;

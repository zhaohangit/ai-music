import axios, { AxiosInstance } from 'axios';
import config from '../config';
import logger from '../utils/logger';
import { LLMError, ErrorCode, LyricsResult, StyleRecommendation } from '../types/errors';

/**
 * JoyBuilder API响应类型
 */
interface JoyBuilderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface JoyBuilderRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface JoyBuilderChatResponse {
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

/**
 * JoyBuilder API服务类
 * 京东内部大模型服务平台，提供歌词生成、风格增强等功能
 *
 * 平台文档：
 * - JoyBuilder API文档：https://joyspace.jd.com/teams/UANJsSBkTLfumcnaR0WYk/root
 * - 集团网关API文档：https://joyspace.jd.com/pages/hQTBswr7k3AusgP2k2XZ
 *
 * 推荐模型：
 * - DeepSeek-V3.2: 歌词生成（性价比最高）
 * - JoyAI-flash: 快速歌词生成（京东内部）
 * - Qwen3-8B: 风格分析和推荐
 * - DeepSeek-R1-0528: 复杂创意歌词（深度思考）
 * - Kimi-K2.5: 多模态创意内容
 */
class JoyBuilderService {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private models: {
    lyricsGeneration: string;    // 歌词生成
    styleAnalysis: string;       // 风格分析
    creativeWriting: string;     // 复杂创意
    quickGeneration: string;     // 快速生成
  };
  private isAvailable: boolean = false;

  constructor() {
    this.baseURL = config.joybuilder.baseURL;
    this.apiKey = config.joybuilder.apiKey;

    // 推荐模型配置
    this.models = {
      lyricsGeneration: config.joybuilder.models?.lyricsGeneration || 'deepseek-v3.2',
      styleAnalysis: config.joybuilder.models?.styleAnalysis || 'qwen3-8b',
      creativeWriting: config.joybuilder.models?.creativeWriting || 'deepseek-r1-0528',
      quickGeneration: config.joybuilder.models?.quickGeneration || 'joyai-flash',
    };

    // 创建axios实例
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 60000, // 60秒超时
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 如果有API密钥，添加到请求头
    if (this.apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        logger.info('[JoyBuilder] API请求', {
          method: config.method?.toUpperCase(),
          url: config.url,
          hasAuth: !!this.apiKey,
        });
        return config;
      },
      (error) => {
        logger.error('[JoyBuilder] API请求错误', { error: error.message });
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        logger.info('[JoyBuilder] API响应', {
          status: response.status,
          model: response.config.data ? JSON.parse(response.config.data).model : 'unknown',
        });
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );

    // 检查服务可用性
    this.isAvailable = !!(this.baseURL && this.apiKey);

    logger.info('[JoyBuilder] 服务初始化', {
      baseURL: this.baseURL,
      hasApiKey: !!this.apiKey,
      isAvailable: this.isAvailable,
      models: this.models,
    });
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * 处理API错误
   */
  private handleError(error: any): void {
    let errorCode = ErrorCode.LLM_GENERATION_FAILED;
    let errorMessage = 'JoyBuilder API调用失败';

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401 || status === 403) {
        errorCode = ErrorCode.LLM_AUTH_FAILED;
        errorMessage = 'JoyBuilder API认证失败，请检查API Key';
      } else if (status === 429) {
        errorCode = ErrorCode.RATE_LIMIT;
        errorMessage = 'JoyBuilder API请求频率超限';
      } else if (status === 408 || error.code === 'ECONNABORTED') {
        errorCode = ErrorCode.LLM_TIMEOUT;
        errorMessage = 'JoyBuilder API请求超时';
      } else if (data?.error?.message) {
        errorMessage = data.error.message;
      }

      logger.error('[JoyBuilder] API错误响应', {
        status,
        errorCode,
        errorMessage,
        data: error.response.data,
      });
    } else if (error.request) {
      errorCode = ErrorCode.LLM_TIMEOUT;
      errorMessage = 'JoyBuilder API无响应，请检查网络连接';
      logger.error('[JoyBuilder] API无响应', { error: error.message });
    }

    throw new LLMError(errorCode, errorMessage, {
      originalError: error.message,
      provider: 'joybuilder',
    });
  }

  /**
   * 调用JoyBuilder聊天完成API
   * 兼容OpenAI API格式
   */
  private async chat(
    messages: JoyBuilderMessage[],
    options: JoyBuilderRequestOptions = {}
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new LLMError(
        ErrorCode.LLM_AUTH_FAILED,
        'JoyBuilder服务不可用，请检查配置',
        { baseURL: this.baseURL, hasApiKey: !!this.apiKey }
      );
    }

    const {
      model = this.models.lyricsGeneration,
      temperature = 0.8,
      maxTokens = 2000,
    } = options;

    try {
      // JoyBuilder API兼容OpenAI格式
      const response = await this.client.post<JoyBuilderChatResponse>('/chat/completions', {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new LLMError(
          ErrorCode.LLM_GENERATION_FAILED,
          'JoyBuilder API返回了空内容',
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
    let cleanedText = text.trim();

    try {
      return JSON.parse(cleanedText) as T;
    } catch {
      // 尝试提取JSON代码块
      const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim()) as T;
        } catch {}
      }

      // 尝试提取花括号内容
      const braceMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          let jsonStr = this.fixJsonString(braceMatch[0]);
          return JSON.parse(jsonStr) as T;
        } catch {}
      }

      if (fallback !== undefined) {
        return fallback;
      }
      return null;
    }
  }

  /**
   * 修复JSON字符串中的格式问题
   */
  private fixJsonString(jsonStr: string): string {
    let result = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

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
      }

      result += char;
    }

    return result;
  }

  /**
   * 生成歌词
   * 使用DeepSeek-V3.2模型
   */
  async generateLyrics(
    userIdea: string,
    style: string,
    mood: string
  ): Promise<LyricsResult> {
    logger.info('[JoyBuilder] 开始生成歌词', { userIdea, style, mood });

    const systemPrompt = `你是一位专业的歌词创作专家。你的任务是根据用户提供的创意、风格和情绪，创作出优美的歌词。

要求：
1. 歌词必须使用标准的英文歌曲结构标签（Suno API要求的格式）：
   - [Intro] - 前奏
   - [Verse], [Verse 1], [Verse 2] 等 - 主歌
   - [Chorus] - 副歌
   - [Bridge] - 桥段
   - [Outro] - 尾奏
2. 歌词内容必须使用中文（除非用户明确要求英文）
3. 歌曲标题必须使用中文
4. 不要在歌词中添加括号说明
5. 歌词要符合指定的音乐风格
6. 歌词要准确表达指定的情绪
7. 歌词要有押韵和节奏感
8. 返回格式必须是纯JSON：
{
  "title": "中文歌曲标题",
  "lyrics": "完整的中文歌词内容，使用英文结构标签"
}`;

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
        { model: this.models.lyricsGeneration, temperature: 0.9, maxTokens: 2000 }
      );

      const result = this.safeJsonParse<LyricsResult>(response);

      if (!result || !result.title || !result.lyrics) {
        throw new LLMError(
          ErrorCode.LLM_GENERATION_FAILED,
          '歌词生成结果格式不正确',
          { response: response.substring(0, 500) }
        );
      }

      logger.info('[JoyBuilder] 歌词生成成功', { title: result.title, lyricsLength: result.lyrics.length });
      return result;
    } catch (error) {
      logger.error('[JoyBuilder] 歌词生成失败', { error });
      throw error;
    }
  }

  /**
   * 风格分析和推荐
   * 使用Qwen3-8B模型
   */
  async analyzeAndRecommendStyle(description: string): Promise<string[]> {
    logger.info('[JoyBuilder] 开始风格分析', { description });

    const prompt = `根据以下描述，推荐3-5个最适合的音乐风格标签：
"${description}"

直接返回标签列表，用逗号分隔。例如：中文流行,R&B,抒情`;

    try {
      const response = await this.chat(
        [{ role: 'user', content: prompt }],
        { model: this.models.styleAnalysis, temperature: 0.3, maxTokens: 100 }
      );

      const tags = response
        .split(/[,，、\n]/)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 5);

      logger.info('[JoyBuilder] 风格分析成功', { tags });
      return tags;
    } catch (error) {
      logger.error('[JoyBuilder] 风格分析失败', { error });
      throw error;
    }
  }

  /**
   * 增强用户输入的prompt
   * 使用JoyAI-flash快速模型
   */
  async enhancePrompt(userInput: string): Promise<string> {
    logger.info('[JoyBuilder] 开始增强prompt', { userInput });

    const prompt = `将用户的简单描述扩展为详细、专业的音乐生成提示词。

用户描述："${userInput}"

请扩展为一个详细、专业的音乐描述，包含：
1. 歌曲主题和情感基调
2. 乐器编配建议（如钢琴、吉他、鼓点等）
3. 节奏和速度（如中速、快节奏、慢板等）
4. 人声风格（如温柔女声、磁性男声等）

直接返回扩展后的描述，不要有多余解释。`;

    try {
      const enhancedPrompt = await this.chat(
        [{ role: 'user', content: prompt }],
        { model: this.models.quickGeneration, temperature: 0.6, maxTokens: 400 }
      );

      logger.info('[JoyBuilder] Prompt增强成功', {
        originalLength: userInput.length,
        enhancedLength: enhancedPrompt.length
      });
      return enhancedPrompt;
    } catch (error) {
      logger.error('[JoyBuilder] Prompt增强失败', { error });
      throw error;
    }
  }

  /**
   * 复杂创意歌词生成
   * 使用DeepSeek-R1深度思考模型
   */
  async generateCreativeLyrics(
    userIdea: string,
    style: string,
    mood: string,
    additionalContext?: string
  ): Promise<LyricsResult> {
    logger.info('[JoyBuilder] 开始复杂创意歌词生成', { userIdea, style, mood });

    const systemPrompt = `你是一位资深的歌词创作大师，擅长创作富有深度和艺术性的歌词。

要求：
1. 歌词要有文学性和艺术性
2. 使用英文结构标签：[Intro], [Verse], [Chorus], [Bridge], [Outro]
3. 歌词内容使用中文
4. 歌曲标题使用中文
5. 返回JSON格式：
{
  "title": "歌曲标题",
  "lyrics": "歌词内容"
}`;

    const userPrompt = `创作一首富有艺术性的歌曲：

主题：${userIdea}
风格：${style}
情绪：${mood}
${additionalContext ? `额外要求：${additionalContext}` : ''}

请创作一首完整的歌词。`;

    try {
      const response = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { model: this.models.creativeWriting, temperature: 0.9, maxTokens: 3000 }
      );

      const result = this.safeJsonParse<LyricsResult>(response);

      if (!result || !result.title || !result.lyrics) {
        throw new LLMError(
          ErrorCode.LLM_GENERATION_FAILED,
          '创意歌词生成结果格式不正确',
          { response: response.substring(0, 500) }
        );
      }

      logger.info('[JoyBuilder] 创意歌词生成成功', { title: result.title });
      return result;
    } catch (error) {
      logger.error('[JoyBuilder] 创意歌词生成失败', { error });
      throw error;
    }
  }

  /**
   * 完整风格推荐（包含情绪和节奏）
   */
  async recommendStyle(description: string): Promise<StyleRecommendation> {
    logger.info('[JoyBuilder] 开始完整风格推荐', { description });

    const systemPrompt = `你是一位音乐风格分析专家。根据用户描述推荐音乐风格。

返回纯JSON格式：
{
  "tags": ["风格标签1", "风格标签2", "风格标签3"],
  "mood": "情绪描述",
  "tempo": "节奏描述（如：快速、中等、缓慢）"
}`;

    const userPrompt = `分析以下描述并推荐音乐风格：

用户描述：${description}`;

    try {
      const response = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { model: this.models.styleAnalysis, temperature: 0.5, maxTokens: 200 }
      );

      const recommendation = this.safeJsonParse<StyleRecommendation>(response, {
        tags: ['流行'],
        mood: '温暖',
        tempo: '中速',
      });

      if (!recommendation) {
        return { tags: ['流行'], mood: '温暖', tempo: '中速' };
      }

      logger.info('[JoyBuilder] 风格推荐成功', recommendation);
      return recommendation;
    } catch (error) {
      logger.error('[JoyBuilder] 风格推荐失败', { error });
      throw error;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const response = await this.chat(
        [{ role: 'user', content: 'Hello' }],
        { model: this.models.quickGeneration, temperature: 0.1, maxTokens: 10 }
      );
      return !!response;
    } catch (error) {
      logger.error('[JoyBuilder] 服务健康检查失败', { error });
      return false;
    }
  }

  /**
   * 获取服务配置信息
   */
  getConfigInfo() {
    return {
      baseURL: this.baseURL,
      hasApiKey: !!this.apiKey,
      isAvailable: this.isAvailable,
      models: this.models,
    };
  }
}

// 导出单例
export const joyBuilderService = new JoyBuilderService();
export default joyBuilderService;

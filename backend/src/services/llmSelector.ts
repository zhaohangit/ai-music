import { LLMProvider } from '../types/errors';
import config from '../config';
import logger from '../utils/logger';

export interface LLMSelectionContext {
  isInternal: boolean;      // 是否内网环境
  complexity: 'simple' | 'medium' | 'complex';  // 任务复杂度
  priority: 'speed' | 'quality' | 'cost';       // 优先级
}

export interface LLMServiceInfo {
  provider: LLMProvider;
  available: boolean;
  reason: string;
}

/**
 * LLM选择器
 * 根据环境和需求自动选择最佳LLM服务
 *
 * 服务对比：
 * | 特性 | JoyBuilder (内网) | 智谱GLM (外网) |
 * |------|-------------------|----------------|
 * | 网络环境 | 仅内网可用 | 公网访问 |
 * | 歌词质量 | 优秀 | 优秀 |
 * | 响应速度 | 快 | 中等 |
 * | 成本 | 内部核算 | 按量付费 |
 * | 中文支持 | 优秀 | 优秀 |
 * | 创意程度 | 高 | 很高 |
 * | 免费额度 | 内部额度 | glm-4-flash免费 |
 */
export class LLMSelector {

  /**
   * 检查JoyBuilder服务是否可用
   */
  static isJoyBuilderAvailable(): boolean {
    return !!(config.joybuilder.baseURL && config.joybuilder.apiKey);
  }

  /**
   * 检查GLM服务是否可用
   */
  static isGLMAvailable(): boolean {
    return !!(config.glm.baseURL && config.glm.authorization);
  }

  /**
   * 获取所有可用服务
   */
  static getAvailableServices(): LLMServiceInfo[] {
    const services: LLMServiceInfo[] = [];

    const joyBuilderAvailable = this.isJoyBuilderAvailable();
    services.push({
      provider: LLMProvider.JOYBUILDER,
      available: joyBuilderAvailable,
      reason: joyBuilderAvailable
        ? 'JoyBuilder服务已配置'
        : 'JoyBuilder未配置（需要JOYBUILDER_API_URL和JOYBUILDER_API_KEY）'
    });

    const glmAvailable = this.isGLMAvailable();
    services.push({
      provider: LLMProvider.GLM,
      available: glmAvailable,
      reason: glmAvailable
        ? 'GLM服务已配置'
        : 'GLM未配置（需要GLM_AUTHORIZATION）'
    });

    return services;
  }

  /**
   * 根据环境自动选择最佳LLM服务
   */
  static selectProvider(context: LLMSelectionContext): LLMProvider {
    const joyBuilderAvailable = this.isJoyBuilderAvailable();
    const glmAvailable = this.isGLMAvailable();

    logger.info('[LLMSelector] 选择LLM服务', {
      context,
      joyBuilderAvailable,
      glmAvailable,
      networkEnv: config.network.env
    });

    // 如果只有一个服务可用，直接使用
    if (joyBuilderAvailable && !glmAvailable) {
      logger.info('[LLMSelector] 只有JoyBuilder可用');
      return LLMProvider.JOYBUILDER;
    }

    if (glmAvailable && !joyBuilderAvailable) {
      logger.info('[LLMSelector] 只有GLM可用');
      return LLMProvider.GLM;
    }

    // 两个都可用，根据环境和需求选择
    if (joyBuilderAvailable && glmAvailable) {
      // 内网环境优先使用JoyBuilder
      if (context.isInternal) {
        logger.info('[LLMSelector] 内网环境，选择JoyBuilder');
        return LLMProvider.JOYBUILDER;
      }

      // 外网环境根据优先级选择
      if (context.priority === 'cost') {
        // GLM-4-flash免费
        logger.info('[LLMSelector] 优先成本，选择GLM (免费模型)');
        return LLMProvider.GLM;
      }

      if (context.priority === 'speed') {
        // JoyBuilder的JoyAI-flash速度最快
        if (config.network.isInternal || context.isInternal) {
          logger.info('[LLMSelector] 优先速度，内网选择JoyBuilder');
          return LLMProvider.JOYBUILDER;
        }
        logger.info('[LLMSelector] 优先速度，外网选择GLM');
        return LLMProvider.GLM;
      }

      // 优先质量：复杂任务用DeepSeek-R1（JoyBuilder）或GLM-5
      if (context.complexity === 'complex') {
        if (config.network.isInternal || context.isInternal) {
          logger.info('[LLMSelector] 复杂任务，内网选择JoyBuilder (DeepSeek-R1)');
          return LLMProvider.JOYBUILDER;
        }
        logger.info('[LLMSelector] 复杂任务，外网选择GLM');
        return LLMProvider.GLM;
      }

      // 默认：外网用GLM，内网用JoyBuilder
      if (config.network.isInternal) {
        logger.info('[LLMSelector] 默认选择JoyBuilder（内网）');
        return LLMProvider.JOYBUILDER;
      }
    }

    // 默认使用GLM
    logger.info('[LLMSelector] 默认选择GLM');
    return LLMProvider.GLM;
  }

  /**
   * 获取默认LLM提供商
   */
  static getDefaultProvider(): LLMProvider {
    return this.selectProvider({
      isInternal: config.network.isInternal,
      complexity: 'medium',
      priority: 'quality'
    });
  }

  /**
   * 根据任务类型获取推荐的LLM配置
   */
  static getRecommendedConfig(provider: LLMProvider, task: string): {
    model: string;
    temperature: number;
    maxTokens: number;
  } {
    switch (provider) {
      case LLMProvider.GLM:
        return this.getGLMConfig(task);

      case LLMProvider.JOYBUILDER:
        return this.getJoyBuilderConfig(task);

      default:
        return {
          model: 'glm-4-flash',
          temperature: 0.7,
          maxTokens: 2000
        };
    }
  }

  /**
   * 获取GLM任务配置
   */
  private static getGLMConfig(task: string): {
    model: string;
    temperature: number;
    maxTokens: number;
  } {
    switch (task) {
      case 'lyrics':
        return {
          model: config.glm.models.creative,
          temperature: 0.85,
          maxTokens: 2500
        };
      case 'style':
        return {
          model: config.glm.models.fast,
          temperature: 0.3,
          maxTokens: 200
        };
      case 'enhance':
        return {
          model: config.glm.models.fast,
          temperature: 0.6,
          maxTokens: 400
        };
      case 'polish':
        return {
          model: config.glm.models.creative,
          temperature: 0.5,
          maxTokens: 2000
        };
      default:
        return {
          model: config.glm.models.creative,
          temperature: 0.7,
          maxTokens: 2000
        };
    }
  }

  /**
   * 获取JoyBuilder任务配置
   */
  private static getJoyBuilderConfig(task: string): {
    model: string;
    temperature: number;
    maxTokens: number;
  } {
    switch (task) {
      case 'lyrics':
        return {
          model: config.joybuilder.models.lyricsGeneration,
          temperature: 0.9,
          maxTokens: 2000
        };
      case 'style':
        return {
          model: config.joybuilder.models.styleAnalysis,
          temperature: 0.3,
          maxTokens: 100
        };
      case 'enhance':
        return {
          model: config.joybuilder.models.quickGeneration,
          temperature: 0.6,
          maxTokens: 400
        };
      case 'polish':
        return {
          model: config.joybuilder.models.lyricsGeneration,
          temperature: 0.8,
          maxTokens: 2000
        };
      case 'creative':
        return {
          model: config.joybuilder.models.creativeWriting,
          temperature: 0.9,
          maxTokens: 3000
        };
      default:
        return {
          model: config.joybuilder.models.lyricsGeneration,
          temperature: 0.8,
          maxTokens: 2000
        };
    }
  }

  /**
   * 获取服务状态摘要
   */
  static getStatusSummary(): {
    defaultProvider: LLMProvider;
    services: LLMServiceInfo[];
    networkEnv: string;
  } {
    return {
      defaultProvider: this.getDefaultProvider(),
      services: this.getAvailableServices(),
      networkEnv: config.network.env
    };
  }
}

export default LLMSelector;

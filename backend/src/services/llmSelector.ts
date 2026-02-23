import { LLMProvider } from '../types/errors';
import config from '../config';

export interface LLMSelectionContext {
  isInternal: boolean;      // 是否内网环境
  complexity: 'simple' | 'medium' | 'complex';  // 任务复杂度
  priority: 'speed' | 'quality' | 'cost';       // 优先级
}

/**
 * LLM选择器
 * 根据环境和需求自动选择最佳LLM服务
 */
export class LLMSelector {

  /**
   * 根据环境自动选择最佳LLM服务
   */
  static selectProvider(context: LLMSelectionContext): LLMProvider {
    // 内网环境优先使用JoyBuilder
    if (context.isInternal && config.joybuilder.apiKey) {
      if (context.priority === 'speed') {
        return LLMProvider.JOYBUILDER;  // JoyAI-flash
      }
      if (context.complexity === 'complex') {
        return LLMProvider.JOYBUILDER;  // DeepSeek-R1
      }
      return LLMProvider.JOYBUILDER;    // DeepSeek-V3.2
    }

    // 外网环境使用GLM
    if (context.priority === 'cost') {
      return LLMProvider.GLM;  // glm-4-flash (免费)
    }
    if (context.complexity === 'complex') {
      return LLMProvider.GLM;  // glm-5
    }
    return LLMProvider.GLM;    // glm-4
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
   * 获取推荐的LLM配置
   */
  static getRecommendedConfig(provider: LLMProvider, task: string): {
    model: string;
    temperature: number;
    maxTokens: number;
  } {
    switch (provider) {
      case LLMProvider.GLM:
        if (task === 'lyrics') {
          return {
            model: config.glm.models.creative,
            temperature: 0.85,
            maxTokens: 2500
          };
        }
        if (task === 'style') {
          return {
            model: config.glm.models.fast,
            temperature: 0.3,
            maxTokens: 200
          };
        }
        return {
          model: config.glm.models.creative,
          temperature: 0.7,
          maxTokens: 2000
        };

      case LLMProvider.JOYBUILDER:
        return {
          model: 'deepseek-v3.2',
          temperature: 0.8,
          maxTokens: 2000
        };

      default:
        return {
          model: 'glm-4-flash',
          temperature: 0.7,
          maxTokens: 2000
        };
    }
  }
}

export default LLMSelector;

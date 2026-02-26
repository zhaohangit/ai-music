import { useCallback, useRef } from 'react';
import { useSkill } from '../contexts/SkillContext';
import { musicApi } from '../services/api';

interface MusicGenerationOptions {
  prompt: string;
  lyrics?: string;
  style?: string;
  tags?: string;  // 逗号分隔的字符串
  [key: string]: any;
}

interface UseSkillEnhancedAIResult {
  generateWithSkill: (options: MusicGenerationOptions) => Promise<any>;
  getEnhancedPrompt: (userPrompt: string) => string;
  isSkillAvailable: boolean;
  skillName: string | null;
}

/**
 * 技能增强的 AI 生成 Hook
 * 自动将技能上下文注入到 AI 请求中
 */
export function useSkillEnhancedAI(): UseSkillEnhancedAIResult {
  const { skillContext, getAIContext, loading } = useSkill();
  const lastContextRef = useRef<string | null>(null);

  // 获取增强后的提示词
  const getEnhancedPrompt = useCallback((userPrompt: string): string => {
    const aiContext = getAIContext();

    if (!aiContext) {
      return userPrompt;
    }

    // 将技能上下文与用户提示词结合
    // 注意：实际格式需要根据后端 AI 服务的要求调整
    const enhancedPrompt = `[Context: Following the guidance for ${skillContext?.name || 'music creation'}]

Skill Guidelines:
${aiContext.slice(0, 500)}${aiContext.length > 500 ? '...' : ''}

User Request:
${userPrompt}`;

    return enhancedPrompt;
  }, [getAIContext, skillContext]);

  // 使用技能上下文生成音乐
  const generateWithSkill = useCallback(async (options: MusicGenerationOptions): Promise<any> => {
    const aiContext = getAIContext();

    // 记录当前技能上下文（用于调试和分析）
    if (aiContext !== lastContextRef.current) {
      console.log('[SkillEnhancedAI] Using skill context:', skillContext?.name);
      lastContextRef.current = aiContext;
    }

    // 准备请求参数
    const requestParams = {
      ...options,
      // 将技能上下文作为元数据传递
      _skillContext: aiContext ? {
        name: skillContext?.name,
        description: skillContext?.description,
        contentHash: simpleHash(aiContext) // 用于追踪
      } : null,
      // 增强提示词（可选，取决于后端实现）
      enhancedPrompt: aiContext ? getEnhancedPrompt(options.prompt) : options.prompt
    };

    try {
      // 调用音乐生成 API
      const response = await musicApi.create(requestParams);

      // 如果后端支持，可以传递技能上下文作为 header 或参数
      // 这里我们假设后端会在处理时参考技能上下文

      return response;
    } catch (error) {
      console.error('[SkillEnhancedAI] Generation failed:', error);
      throw error;
    }
  }, [getAIContext, skillContext, getEnhancedPrompt]);

  return {
    generateWithSkill,
    getEnhancedPrompt,
    isSkillAvailable: !loading && !!skillContext,
    skillName: skillContext?.name || null
  };
}

// 简单哈希函数，用于追踪上下文变化
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

export default useSkillEnhancedAI;

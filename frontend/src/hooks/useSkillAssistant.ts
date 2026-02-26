/**
 * useSkillAssistant Hook
 * 提供技能助手的完整功能，包括描述分析、风格推荐等
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSkill } from '../contexts/SkillContext';
import { skillAssistantService } from '../services/skill';
import {
  DescriptionAnalysis,
  StyleRecommendation,
  UseSkillAssistantResult,
  StructuredSkill,
  QuickTag,
} from '../services/skill/types';

// 防抖延迟（毫秒）
const DEBOUNCE_DELAY = 300;

/**
 * 快捷标签配置
 */
export const quickTagsConfig: QuickTag[] = [
  // 情绪标签
  { label: '欢快', value: '欢快', category: 'mood' },
  { label: '放松', value: '放松', category: 'mood' },
  { label: '浪漫', value: '浪漫', category: 'mood' },
  { label: '激情', value: '激情', category: 'mood' },
  { label: '忧郁', value: '忧郁', category: 'mood' },
  { label: '温暖', value: '温暖', category: 'mood' },

  // 节奏标签
  { label: '快节奏', value: '快节奏', category: 'rhythm' },
  { label: '中等节奏', value: '中等节奏', category: 'rhythm' },
  { label: '慢节奏', value: '慢节奏', category: 'rhythm' },
  { label: '律动感', value: '律动感', category: 'rhythm' },

  // 乐器标签
  { label: '吉他', value: '吉他', category: 'instrument' },
  { label: '钢琴', value: '钢琴', category: 'instrument' },
  { label: '电子', value: '电子', category: 'instrument' },
  { label: '弦乐', value: '弦乐', category: 'instrument' },

  // 场景标签
  { label: '海边', value: '海边', category: 'scene' },
  { label: '驾车', value: '驾车', category: 'scene' },
  { label: '运动', value: '运动', category: 'scene' },
  { label: '睡前', value: '睡前', category: 'scene' },

  // 风格标签
  { label: '流行', value: '流行', category: 'style' },
  { label: '摇滚', value: '摇滚', category: 'style' },
  { label: '爵士', value: '爵士', category: 'style' },
  { label: '民谣', value: '民谣', category: 'style' },
];

/**
 * 技能助手 Hook
 */
export function useSkillAssistant(): UseSkillAssistantResult {
  const { skillContext, getAIContext } = useSkill();

  // 状态
  const [analysis, setAnalysis] = useState<DescriptionAnalysis | null>(null);
  const [recommendations, setRecommendations] = useState<StyleRecommendation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [optimizedDescription, setOptimizedDescription] = useState<string | null>(null);

  // 解析后的 Skill
  const [parsedSkill, setParsedSkill] = useState<StructuredSkill | null>(null);

  // 防抖定时器
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当 Skill 上下文变化时，解析 Skill
  useEffect(() => {
    if (skillContext?.content) {
      try {
        const parsed = skillAssistantService.parseSkill(skillContext.content);
        setParsedSkill(parsed);
      } catch (error) {
        console.warn('[useSkillAssistant] Failed to parse skill:', error);
        setParsedSkill(null);
      }
    }
  }, [skillContext]);

  /**
   * 分析描述（带防抖）
   */
  const analyze = useCallback((description: string) => {
    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 如果描述为空，清除分析结果
    if (!description.trim()) {
      setAnalysis(null);
      setRecommendations([]);
      setOptimizedDescription(null);
      return;
    }

    // 设置新的定时器
    debounceTimerRef.current = setTimeout(() => {
      setIsAnalyzing(true);

      try {
        // 分析描述
        const result = skillAssistantService.analyzeDescription(description, parsedSkill || undefined);
        setAnalysis(result);
        setRecommendations(result.recommendedStyles);
        setOptimizedDescription(result.optimizedDescription || null);
      } catch (error) {
        console.error('[useSkillAssistant] Analysis failed:', error);
        setAnalysis(null);
        setRecommendations([]);
        setOptimizedDescription(null);
      } finally {
        setIsAnalyzing(false);
      }
    }, DEBOUNCE_DELAY);
  }, [parsedSkill]);

  /**
   * 应用推荐
   */
  const applyRecommendation = useCallback((rec: StyleRecommendation) => {
    return {
      genre: rec.genre,
      mood: rec.mood,
    };
  }, []);

  /**
   * 应用优化后的描述
   */
  const applyOptimizedDescription = useCallback(() => {
    return optimizedDescription;
  }, [optimizedDescription]);

  /**
   * 清除分析
   */
  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setRecommendations([]);
    setOptimizedDescription(null);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    analysis,
    recommendations,
    isAnalyzing,
    optimizedDescription,
    analyze,
    applyRecommendation,
    applyOptimizedDescription,
    clearAnalysis,
  };
}

/**
 * 获取快捷标签
 */
export function getQuickTagsByCategory(category: QuickTag['category']): QuickTag[] {
  return quickTagsConfig.filter(tag => tag.category === category);
}

/**
 * 获取所有快捷标签分组
 */
export function getGroupedQuickTags(): Record<string, QuickTag[]> {
  return {
    mood: getQuickTagsByCategory('mood'),
    rhythm: getQuickTagsByCategory('rhythm'),
    instrument: getQuickTagsByCategory('instrument'),
    scene: getQuickTagsByCategory('scene'),
    style: getQuickTagsByCategory('style'),
  };
}

export default useSkillAssistant;

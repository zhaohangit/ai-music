/**
 * 描述分析服务
 * 分析用户输入的音乐描述，评估完整度并提供改进建议
 */

import {
  DescriptionAnalysis,
  DimensionResult,
  ImprovementSuggestion,
  StyleRecommendation,
  StructuredSkill,
} from './types';
import { styleKnowledge } from './knowledge/styleKnowledge';

/**
 * 描述分析器
 */
export class DescriptionAnalyzer {
  // 默认关键词映射
  private defaultKeywords = {
    theme: {
      zh: ['夏天', '夏日', '爱情', '恋爱', '友情', '朋友', '回忆', '过去', '梦想', '旅行', '成长', '夜晚', '自然', '阳光', '海边', '城市', '家乡', '青春', '离别', '遇见'],
      en: ['summer', 'sunshine', 'love', 'romantic', 'friendship', 'friend', 'memory', 'nostalgia', 'dream', 'travel', 'growth', 'night', 'nature', 'beach', 'city', 'hometown', 'youth', 'farewell', 'meet'],
    },
    mood: {
      zh: ['欢快', '快乐', '开心', '放松', '轻松', '浪漫', '温馨', '悲伤', '难过', '忧郁', '激昂', '激情', '温暖', '治愈', '平静', '梦幻', '怀旧', '希望', '力量', '甜蜜'],
      en: ['happy', 'joy', 'relaxing', 'chill', 'romantic', 'warm', 'sad', 'melancholic', 'energetic', 'passionate', 'healing', 'peaceful', 'dreamy', 'nostalgic', 'hopeful', 'powerful', 'sweet'],
    },
    rhythm: {
      zh: ['快节奏', '慢节奏', '中等节奏', '律动感', '轻快', '悠扬', '舒缓', '激昂', '动感', '平稳'],
      en: ['fast', 'slow', 'medium', 'groovy', 'light', 'melodious', 'gentle', 'intense', 'dynamic', 'steady'],
    },
    instrument: {
      zh: ['吉他', '钢琴', '电子', '电子合成器', '弦乐', '小提琴', '大提琴', '打击乐', '鼓', '管乐', '萨克斯', '贝斯', '古筝', '二胡', '琵琶'],
      en: ['guitar', 'piano', 'electronic', 'synth', 'synthesizer', 'strings', 'violin', 'cello', 'percussion', 'drums', 'brass', 'saxophone', 'bass', 'guzheng', 'erhu'],
    },
    style: {
      zh: ['流行', '摇滚', '爵士', '电子', '民谣', '说唱', '嘻哈', '古典', 'R&B', '灵魂', '放克', '乡村', '蓝调', '雷鬼', '金属', '朋克'],
      en: ['pop', 'rock', 'jazz', 'electronic', 'folk', 'hip-hop', 'hiphop', 'classical', 'r&b', 'rnb', 'soul', 'funk', 'country', 'blues', 'reggae', 'metal', 'punk'],
    },
    scene: {
      zh: ['海边', '驾车', '运动', '跑步', '睡前', '睡眠', '咖啡厅', '派对', '聚会', '约会', '晚餐', '工作', '学习', '冥想', '瑜伽', '旅行', '度假'],
      en: ['beach', 'driving', 'workout', 'exercise', 'running', 'sleep', 'cafe', 'coffee', 'party', 'date', 'dinner', 'work', 'study', 'meditation', 'yoga', 'travel', 'vacation'],
    },
  };

  // 维度权重配置
  private dimensionWeights = {
    theme: { weight: 25, importance: 'required' as const },
    mood: { weight: 25, importance: 'required' as const },
    rhythm: { weight: 15, importance: 'recommended' as const },
    instrument: { weight: 15, importance: 'recommended' as const },
    style: { weight: 10, importance: 'optional' as const },
    scene: { weight: 10, importance: 'optional' as const },
  };

  /**
   * 分析描述
   */
  analyze(description: string, skill?: StructuredSkill): DescriptionAnalysis {
    const dimensions = this.detectAllDimensions(description, skill);
    const completeness = this.calculateCompleteness(dimensions);
    const suggestions = this.generateSuggestions(dimensions, description);
    const recommendedStyles = this.recommendStyles(dimensions, skill);
    const optimizedDescription = this.optimizeDescription(description, dimensions);

    return {
      completeness,
      dimensions,
      suggestions,
      recommendedStyles,
      optimizedDescription,
    };
  }

  /**
   * 检测所有维度
   */
  private detectAllDimensions(description: string, skill?: StructuredSkill): Record<string, DimensionResult> {
    const lowerDesc = description.toLowerCase();
    const keywords = skill?.analysis?.dimensions
      ? this.mergeKeywords(skill.analysis.dimensions)
      : this.defaultKeywords;

    return {
      theme: this.detectDimension(lowerDesc, keywords.theme, 'required'),
      mood: this.detectDimension(lowerDesc, keywords.mood, 'required'),
      rhythm: this.detectDimension(lowerDesc, keywords.rhythm, 'recommended'),
      instrument: this.detectDimension(lowerDesc, keywords.instrument, 'recommended'),
      style: this.detectDimension(lowerDesc, keywords.style, 'optional'),
      scene: this.detectDimension(lowerDesc, keywords.scene, 'optional'),
    };
  }

  /**
   * 合并 Skill 关键词和默认关键词
   */
  private mergeKeywords(skillDimensions: Record<string, any>): Record<string, { zh: string[]; en: string[] }> {
    const merged: Record<string, { zh: string[]; en: string[] }> = {};

    for (const [key, config] of Object.entries(this.defaultKeywords)) {
      merged[key] = { ...config };
    }

    for (const [key, config] of Object.entries(skillDimensions)) {
      if (config.keywords) {
        if (!merged[key]) {
          merged[key] = { zh: [], en: [] };
        }
        if (config.keywords.zh) {
          merged[key].zh = [...new Set([...merged[key].zh, ...config.keywords.zh])];
        }
        if (config.keywords.en) {
          merged[key].en = [...new Set([...merged[key].en, ...config.keywords.en])];
        }
      }
    }

    return merged;
  }

  /**
   * 检测单个维度
   */
  private detectDimension(
    description: string,
    keywords: { zh: string[]; en: string[] },
    importance: 'required' | 'recommended' | 'optional'
  ): DimensionResult {
    const allKeywords = [...keywords.zh, ...keywords.en];

    for (const keyword of allKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        return {
          found: true,
          value: keyword,
          importance,
          confidence: 1.0,
        };
      }
    }

    return {
      found: false,
      importance,
    };
  }

  /**
   * 计算完整度
   */
  private calculateCompleteness(dimensions: Record<string, DimensionResult>): number {
    let score = 0;

    for (const [key, config] of Object.entries(this.dimensionWeights)) {
      if (dimensions[key]?.found) {
        score += config.weight;
      }
    }

    return Math.min(100, score);
  }

  /**
   * 生成改进建议
   */
  private generateSuggestions(dimensions: Record<string, DimensionResult>, description: string): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];

    // 检查缺失的必填项
    if (!dimensions.theme.found) {
      suggestions.push({
        type: 'missing',
        dimension: 'theme',
        message: '缺少歌曲主题',
        examples: ['夏天', '爱情', '友情', '回忆', '梦想', '旅行'],
      });
    }

    if (!dimensions.mood.found) {
      suggestions.push({
        type: 'missing',
        dimension: 'mood',
        message: '缺少情绪描述',
        examples: ['欢快', '放松', '浪漫', '激昂', '忧郁', '温暖'],
      });
    }

    // 检查缺失的推荐项
    if (!dimensions.rhythm.found) {
      suggestions.push({
        type: 'add',
        dimension: 'rhythm',
        message: '添加节奏描述会更好',
        examples: ['快节奏', '中等节奏', '慢节奏', '律动感'],
      });
    }

    if (!dimensions.instrument.found) {
      suggestions.push({
        type: 'add',
        dimension: 'instrument',
        message: '添加乐器描述会更有特色',
        examples: ['吉他', '钢琴', '电子合成器', '弦乐'],
      });
    }

    // 检查描述长度
    if (description.length < 10) {
      suggestions.push({
        type: 'improve',
        dimension: 'description',
        message: '描述太短，建议添加更多细节',
        examples: [],
      });
    }

    return suggestions;
  }

  /**
   * 推荐风格
   */
  private recommendStyles(dimensions: Record<string, DimensionResult>, skill?: StructuredSkill): StyleRecommendation[] {
    const recommendations: StyleRecommendation[] = [];
    const rules = skill?.recommendations || styleKnowledge.rules;

    // 收集用户已选择的维度值
    const context = {
      theme: dimensions.theme.value?.toLowerCase() || '',
      scene: dimensions.scene.value?.toLowerCase() || '',
      mood: dimensions.mood.value?.toLowerCase() || '',
      instrument: dimensions.instrument.value?.toLowerCase() || '',
    };

    // 遍历规则，找到匹配的推荐
    for (const rule of rules) {
      const matchScore = this.calculateRuleMatch(rule.when, context);

      if (matchScore > 0) {
        for (const genre of rule.suggest.genres) {
          for (const mood of rule.suggest.moods) {
            recommendations.push({
              genre: this.capitalizeFirst(genre),
              mood: this.capitalizeFirst(mood),
              reason: rule.suggest.reason,
              confidence: rule.confidence * matchScore,
            });
          }
        }
      }
    }

    // 如果没有匹配的规则，返回默认推荐
    if (recommendations.length === 0) {
      recommendations.push({
        genre: 'Pop',
        mood: dimensions.mood.found ? this.capitalizeFirst(dimensions.mood.value!) : 'Energetic',
        reason: '流行音乐风格，适合大多数场景',
        confidence: 0.6,
      });
    }

    // 按置信度排序并去重
    const uniqueRecommendations = this.deduplicateRecommendations(recommendations);
    return uniqueRecommendations.slice(0, 5);
  }

  /**
   * 计算规则匹配分数
   */
  private calculateRuleMatch(
    condition: { theme?: string[]; scene?: string[]; mood?: string[]; instrument?: string[] },
    context: { theme: string; scene: string; mood: string; instrument: string }
  ): number {
    let matchCount = 0;
    let totalConditions = 0;

    for (const [key, values] of Object.entries(condition)) {
      if (values && values.length > 0) {
        totalConditions++;
        const contextValue = context[key as keyof typeof context].toLowerCase();
        if (values.some(v => contextValue.includes(v.toLowerCase()) || v.toLowerCase().includes(contextValue))) {
          matchCount++;
        }
      }
    }

    return totalConditions > 0 ? matchCount / totalConditions : 0;
  }

  /**
   * 优化描述
   */
  private optimizeDescription(original: string, dimensions: Record<string, DimensionResult>): string {
    // 如果完整度已经很高，不需要优化
    const completeness = this.calculateCompleteness(dimensions);
    if (completeness >= 80) {
      return original;
    }

    const parts: string[] = [];

    // 构建优化后的描述
    if (dimensions.theme.found) {
      parts.push(`关于${dimensions.theme.value}`);
    }

    if (dimensions.mood.found) {
      parts.unshift(dimensions.mood.value! + '的');
    } else {
      parts.unshift('一首');
    }

    if (dimensions.style.found) {
      parts.push(dimensions.style.value! + '风格');
    } else {
      parts.push('歌曲');
    }

    if (dimensions.rhythm.found) {
      parts.push(`，${dimensions.rhythm.value}`);
    }

    if (dimensions.instrument.found) {
      parts.push(`，${dimensions.instrument.value}伴奏`);
    }

    if (dimensions.scene.found) {
      parts.push(`，适合${dimensions.scene.value}`);
    }

    return parts.join('') + '。';
  }

  /**
   * 去重推荐
   */
  private deduplicateRecommendations(recommendations: StyleRecommendation[]): StyleRecommendation[] {
    const seen = new Set<string>();
    return recommendations.filter(rec => {
      const key = `${rec.genre}-${rec.mood}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 首字母大写
   */
  private capitalizeFirst(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}

// 导出单例
export const descriptionAnalyzer = new DescriptionAnalyzer();

export default DescriptionAnalyzer;

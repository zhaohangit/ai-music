/**
 * Skill 服务入口
 * 统一导出所有 Skill 相关服务
 */

// 类型
export * from './types';

// 解析器
export { SkillParser, skillParser } from './SkillParser';

// 分析器
export { DescriptionAnalyzer, descriptionAnalyzer } from './DescriptionAnalyzer';

// 知识库
export { styleKnowledge, genreInfo, styleCombinations, recommendationRules } from './knowledge/styleKnowledge';

/**
 * Skill 助手服务
 * 统一的 Skill 服务接口
 */
import { skillParser } from './SkillParser';
import { descriptionAnalyzer } from './DescriptionAnalyzer';
import { styleKnowledge } from './knowledge/styleKnowledge';
import {
  StructuredSkill,
  DescriptionAnalysis,
  StyleRecommendation,
  EnhancedPrompt,
  ISkillAssistantService,
} from './types';

class SkillAssistantService implements ISkillAssistantService {
  /**
   * 解析 Skill 内容
   */
  parseSkill(skillContent: string): StructuredSkill {
    return skillParser.parse(skillContent);
  }

  /**
   * 分析描述
   */
  analyzeDescription(description: string, skill?: StructuredSkill): DescriptionAnalysis {
    return descriptionAnalyzer.analyze(description, skill);
  }

  /**
   * 推荐风格
   */
  recommendStyles(analysis: DescriptionAnalysis, skill?: StructuredSkill): StyleRecommendation[] {
    return analysis.recommendedStyles;
  }

  /**
   * 增强 Prompt
   */
  enhancePrompt(prompt: string, context: string): EnhancedPrompt {
    const analysis = this.analyzeDescription(prompt);

    let enhanced = prompt;

    // 添加缺失的维度
    if (analysis.suggestions.length > 0) {
      const additions: string[] = [];

      for (const suggestion of analysis.suggestions) {
        if (suggestion.type === 'missing' && suggestion.examples && suggestion.examples.length > 0) {
          additions.push(`${suggestion.dimension}可以是${suggestion.examples.slice(0, 3).join('、')}`);
        }
      }

      if (additions.length > 0) {
        enhanced = `${prompt}\n\n建议补充：${additions.join('；')}。`;
      }
    }

    return {
      original: prompt,
      enhanced,
      analysis: {
        theme: analysis.dimensions.theme.value,
        mood: analysis.dimensions.mood.value,
        missingElements: analysis.suggestions
          .filter(s => s.type === 'missing')
          .map(s => s.dimension),
      },
      suggestions: analysis.suggestions.map(s => s.message),
    };
  }

  /**
   * 生成优化后的描述
   */
  generateOptimizedDescription(original: string, analysis: DescriptionAnalysis): string {
    return analysis.optimizedDescription || original;
  }

  /**
   * 获取风格信息
   */
  getGenreInfo(genre: string) {
    return styleKnowledge.genres[genre.toLowerCase()];
  }

  /**
   * 获取风格组合
   */
  getStyleCombinations() {
    return styleKnowledge.combinations;
  }

  /**
   * 获取推荐规则
   */
  getRecommendationRules() {
    return styleKnowledge.rules;
  }
}

// 导出单例
export const skillAssistantService = new SkillAssistantService();

export default skillAssistantService;

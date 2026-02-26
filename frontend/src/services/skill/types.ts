/**
 * Skill 服务类型定义
 * 用于支持结构化 Skill 文件的解析和利用
 */

// ============ Skill 结构化定义 ============

/**
 * 维度关键词配置
 */
export interface DimensionKeywords {
  zh: string[];
  en: string[];
}

/**
 * 维度 BPM 映射
 */
export interface BpmMapping {
  bpm: [number, number];
}

/**
 * 分析维度配置
 */
export interface DimensionConfig {
  weight: number;
  required: boolean;
  keywords: DimensionKeywords;
  extract_regex?: string;
  map_to?: Record<string, BpmMapping>;
}

/**
 * 推荐条件
 */
export interface RecommendationCondition {
  theme?: string[];
  scene?: string[];
  mood?: string[];
  instrument?: string[];
}

/**
 * 推荐结果
 */
export interface RecommendationSuggestion {
  genres: string[];
  moods: string[];
  reason: string;
}

/**
 * 推荐规则
 */
export interface RecommendationRule {
  when: RecommendationCondition;
  suggest: RecommendationSuggestion;
  confidence: number;
}

/**
 * 描述模板
 */
export interface DescriptionTemplates {
  complete: string;
  minimal: string;
  examples: string[];
}

/**
 * Skill 元数据
 */
export interface SkillMetadata {
  id: string;
  type: string;
  pages: string[];
  triggers: string[];
}

/**
 * 结构化 Skill
 */
export interface StructuredSkill {
  metadata: SkillMetadata;
  analysis: {
    dimensions: Record<string, DimensionConfig>;
  };
  recommendations: RecommendationRule[];
  templates: DescriptionTemplates;
  content: string;
}

// ============ 描述分析相关 ============

/**
 * 维度分析结果
 */
export interface DimensionResult {
  found: boolean;
  value?: string;
  importance: 'required' | 'recommended' | 'optional';
  confidence?: number;
}

/**
 * 改进建议类型
 */
export type SuggestionType = 'missing' | 'improve' | 'add';

/**
 * 改进建议
 */
export interface ImprovementSuggestion {
  type: SuggestionType;
  dimension: string;
  message: string;
  examples?: string[];
}

/**
 * 风格推荐结果
 */
export interface StyleRecommendation {
  genre: string;
  mood: string;
  reason: string;
  confidence: number;
}

/**
 * 描述分析结果
 */
export interface DescriptionAnalysis {
  completeness: number;
  dimensions: Record<string, DimensionResult>;
  suggestions: ImprovementSuggestion[];
  recommendedStyles: StyleRecommendation[];
  optimizedDescription?: string;
}

// ============ 风格知识库相关 ============

/**
 * 风格信息
 */
export interface GenreInfo {
  name: string;
  nameCn: string;
  description: string;
  characteristics: string[];
  bpmRange: [number, number];
  suitableFor: string[];
  compatibleMoods: string[];
  exampleDescription: string;
}

/**
 * 风格组合
 */
export interface StyleCombination {
  genres: string[];
  moods: string[];
  description: string;
  useCases: string[];
  popularity: number;
}

/**
 * 风格知识库
 */
export interface StyleKnowledge {
  genres: Record<string, GenreInfo>;
  combinations: StyleCombination[];
  rules: RecommendationRule[];
}

// ============ Prompt 增强相关 ============

/**
 * Prompt 增强结果
 */
export interface EnhancedPrompt {
  original: string;
  enhanced: string;
  analysis?: {
    theme?: string;
    mood?: string;
    missingElements: string[];
  };
  suggestions?: string[];
}

// ============ Skill 助手服务接口 ============

/**
 * Skill 助手服务接口
 */
export interface ISkillAssistantService {
  parseSkill(skillContent: string): StructuredSkill;
  analyzeDescription(description: string, skill?: StructuredSkill): DescriptionAnalysis;
  recommendStyles(analysis: DescriptionAnalysis, skill?: StructuredSkill): StyleRecommendation[];
  enhancePrompt(prompt: string, context: string): EnhancedPrompt;
  generateOptimizedDescription(original: string, analysis: DescriptionAnalysis): string;
}

// ============ Hook 相关 ============

/**
 * useSkillAssistant Hook 返回值
 */
export interface UseSkillAssistantResult {
  analysis: DescriptionAnalysis | null;
  recommendations: StyleRecommendation[];
  isAnalyzing: boolean;
  optimizedDescription: string | null;

  analyze: (description: string) => void;
  applyRecommendation: (rec: StyleRecommendation) => { genre: string; mood: string };
  applyOptimizedDescription: () => string | null;
  clearAnalysis: () => void;
}

// ============ UI 组件相关 ============

/**
 * 快捷标签
 */
export interface QuickTag {
  label: string;
  value: string;
  category: 'mood' | 'rhythm' | 'instrument' | 'scene' | 'style';
}

/**
 * 引导步骤
 */
export interface GuidedStep {
  id: string;
  title: string;
  question: string;
  options: Array<{
    label: string;
    value: string;
    icon?: string;
  }>;
  multiSelect?: boolean;
}

/**
 * 引导结果
 */
export interface GuidedResult {
  theme?: string;
  mood?: string;
  rhythm?: string;
  instruments?: string[];
  scene?: string;
  generatedDescription: string;
  recommendedSettings: {
    genre: string;
    mood: string;
  };
}

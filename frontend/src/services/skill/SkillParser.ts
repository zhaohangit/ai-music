/**
 * Skill 解析器
 * 用于解析结构化的 Skill 文件内容
 */

import {
  StructuredSkill,
  SkillMetadata,
  DimensionConfig,
  RecommendationRule,
  DescriptionTemplates,
} from './types';

/**
 * Skill 解析器类
 * 解析包含 YAML 块的 Markdown 文件
 */
export class SkillParser {
  private yamlBlockRegex = /---\s*\n([\s\S]*?)\n---/g;
  private yamlSectionRegex = /^(\w+):\s*$/;

  /**
   * 解析 Skill 内容
   */
  parse(markdown: string): StructuredSkill {
    // 提取所有 YAML 块
    const yamlBlocks = this.extractYamlBlocks(markdown);

    // 解析各个部分
    const metadata = this.parseMetadata(yamlBlocks.frontmatter);
    const analysis = this.parseAnalysis(yamlBlocks.sections);
    const recommendations = this.parseRecommendations(yamlBlocks.sections);
    const templates = this.parseTemplates(yamlBlocks.sections);

    // 移除 YAML 块后的纯 Markdown 内容
    const content = this.removeYamlBlocks(markdown);

    return {
      metadata,
      analysis,
      recommendations,
      templates,
      content,
    };
  }

  /**
   * 提取所有 YAML 块
   */
  private extractYamlBlocks(markdown: string): {
    frontmatter: Record<string, any>;
    sections: Record<string, any>;
  } {
    const blocks: string[] = [];
    let match;

    while ((match = this.yamlBlockRegex.exec(markdown)) !== null) {
      blocks.push(match[1]);
    }

    // 第一个块是 frontmatter
    const frontmatter = blocks.length > 0 ? this.parseSimpleYaml(blocks[0]) : {};

    // 其他块按 section 名称组织
    const sections: Record<string, any> = {};
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const sectionName = this.extractSectionName(block);
      if (sectionName) {
        sections[sectionName] = this.parseSimpleYaml(block);
      }
    }

    return { frontmatter, sections };
  }

  /**
   * 从 YAML 块中提取 section 名称
   */
  private extractSectionName(yamlContent: string): string | null {
    const lines = yamlContent.split('\n');
    for (const line of lines) {
      const match = line.match(this.yamlSectionRegex);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * 简单的 YAML 解析器
   * 支持基本的键值对、列表和嵌套对象
   */
  private parseSimpleYaml(yamlContent: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yamlContent.split('\n');
    let currentKey = '';
    let currentIndent = 0;
    let inList = false;
    let listItems: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const indent = line.length - line.trimStart().length;

      // 列表项
      if (trimmedLine.startsWith('- ')) {
        const value = trimmedLine.slice(2).trim();
        // 处理带引号的字符串
        const cleanValue = this.cleanValue(value);
        listItems.push(cleanValue);
        inList = true;
        continue;
      }

      // 键值对
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex > 0) {
        // 如果之前在处理列表，保存列表
        if (inList && currentKey && listItems.length > 0) {
          result[currentKey] = listItems;
          listItems = [];
          inList = false;
        }

        const key = trimmedLine.slice(0, colonIndex).trim();
        let value = trimmedLine.slice(colonIndex + 1).trim();

        if (value === '' || value === '|' || value === '>') {
          // 值在下一行或多行
          currentKey = key;
          currentIndent = indent;

          // 检查下一行是否是列表或对象
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const nextTrimmed = nextLine.trim();
            if (nextTrimmed.startsWith('- ')) {
              // 是列表，继续处理
              continue;
            }
            if (nextLine.includes(':') && nextLine.length - nextLine.trimStart().length > indent) {
              // 是嵌套对象
              result[key] = {};
              continue;
            }
          }
          result[key] = '';
        } else {
          // 行内值
          currentKey = key;
          result[key] = this.cleanValue(value);
        }
      }
    }

    // 处理最后一个列表
    if (inList && currentKey && listItems.length > 0) {
      result[currentKey] = listItems;
    }

    return result;
  }

  /**
   * 清理值（移除引号等）
   */
  private cleanValue(value: string): any {
    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // 布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;

    // 数字
    const num = Number(value);
    if (!isNaN(num)) return num;

    // 数组格式 [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
    }

    return value;
  }

  /**
   * 解析元数据
   */
  private parseMetadata(frontmatter: Record<string, any>): SkillMetadata {
    return {
      id: frontmatter.name || frontmatter.id || 'unknown',
      type: frontmatter.type || 'general',
      pages: Array.isArray(frontmatter.pages)
        ? frontmatter.pages
        : frontmatter.pages?.split(',').map((s: string) => s.trim()) || [],
      triggers: Array.isArray(frontmatter.triggers)
        ? frontmatter.triggers
        : [],
    };
  }

  /**
   * 解析分析配置
   */
  private parseAnalysis(sections: Record<string, any>): { dimensions: Record<string, DimensionConfig> } {
    const analysisSection = sections.analysis || sections.skill || {};
    const dimensionsData = analysisSection.dimensions || {};

    const dimensions: Record<string, DimensionConfig> = {};

    for (const [key, value] of Object.entries(dimensionsData)) {
      if (typeof value === 'object' && value !== null) {
        const config = value as any;
        dimensions[key] = {
          weight: config.weight || 10,
          required: config.required || false,
          keywords: this.parseKeywords(config.keywords),
          extract_regex: config.extract_regex,
          map_to: config.map_to,
        };
      }
    }

    return { dimensions };
  }

  /**
   * 解析关键词配置
   */
  private parseKeywords(keywords: any): { zh: string[]; en: string[] } {
    if (!keywords) return { zh: [], en: [] };

    if (Array.isArray(keywords)) {
      // 如果是数组，自动分类
      const zh: string[] = [];
      const en: string[] = [];
      for (const kw of keywords) {
        if (/[\u4e00-\u9fa5]/.test(kw)) {
          zh.push(kw);
        } else {
          en.push(kw);
        }
      }
      return { zh, en };
    }

    return {
      zh: Array.isArray(keywords.zh) ? keywords.zh : [],
      en: Array.isArray(keywords.en) ? keywords.en : [],
    };
  }

  /**
   * 解析推荐规则
   */
  private parseRecommendations(sections: Record<string, any>): RecommendationRule[] {
    const recSection = sections.recommendations || [];

    if (!Array.isArray(recSection)) {
      // 可能是对象格式
      if (recSection.rules && Array.isArray(recSection.rules)) {
        return recSection.rules.map(this.parseRecommendationRule);
      }
      return [];
    }

    return recSection.map(this.parseRecommendationRule);
  }

  /**
   * 解析单个推荐规则
   */
  private parseRecommendationRule(rule: any): RecommendationRule {
    return {
      when: {
        theme: Array.isArray(rule.when?.theme) ? rule.when.theme : rule.when?.theme ? [rule.when.theme] : [],
        scene: Array.isArray(rule.when?.scene) ? rule.when.scene : rule.when?.scene ? [rule.when.scene] : [],
        mood: Array.isArray(rule.when?.mood) ? rule.when.mood : rule.when?.mood ? [rule.when.mood] : [],
        instrument: Array.isArray(rule.when?.instrument) ? rule.when.instrument : rule.when?.instrument ? [rule.when.instrument] : [],
      },
      suggest: {
        genres: Array.isArray(rule.suggest?.genres) ? rule.suggest.genres : [],
        moods: Array.isArray(rule.suggest?.moods) ? rule.suggest.moods : [],
        reason: rule.suggest?.reason || '',
      },
      confidence: rule.confidence || 0.5,
    };
  }

  /**
   * 解析模板
   */
  private parseTemplates(sections: Record<string, any>): DescriptionTemplates {
    const templatesSection = sections.templates || {};

    return {
      complete: templatesSection.complete || '{mood}的{theme}{style}歌曲，{rhythm}，{instrument}伴奏，{scene}',
      minimal: templatesSection.minimal || '{theme}的{style}',
      examples: Array.isArray(templatesSection.examples) ? templatesSection.examples : [],
    };
  }

  /**
   * 移除 YAML 块，保留纯 Markdown 内容
   */
  private removeYamlBlocks(markdown: string): string {
    return markdown.replace(this.yamlBlockRegex, '').trim();
  }
}

// 导出单例
export const skillParser = new SkillParser();

export default SkillParser;

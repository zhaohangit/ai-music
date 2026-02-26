/**
 * 创作助手面板
 * 实时分析用户描述，提供改进建议和风格推荐
 */

import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Check,
  X,
  Lightbulb,
  Target,
  Wand2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { DescriptionAnalysis, StyleRecommendation } from '../../services/skill/types';

// ============ 样式组件 ============

const PanelContainer = styled.div<{ $collapsed: boolean }>`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(250, 45, 72, 0.05) 0%, rgba(255, 255, 255, 0) 100%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  cursor: pointer;
  user-select: none;

  &:hover {
    background: linear-gradient(135deg, rgba(250, 45, 72, 0.08) 0%, rgba(255, 255, 255, 0) 100%);
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HeaderIcon = styled.div`
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #FA2D48 0%, #FF6B6B 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const HeaderTitle = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1D1D1F;
`;

const HeaderBadge = styled.span`
  font-size: 0.6875rem;
  padding: 2px 6px;
  background: rgba(250, 45, 72, 0.1);
  color: #FA2D48;
  border-radius: 4px;
  font-weight: 500;
`;

const CollapseButton = styled.button`
  background: none;
  border: none;
  color: #86868B;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;

  &:hover {
    color: #1D1D1F;
  }
`;

const PanelContent = styled.div<{ $collapsed: boolean }>`
  padding: ${props => props.$collapsed ? '0' : '16px'};
  max-height: ${props => props.$collapsed ? '0' : '600px'};
  overflow: hidden;
  transition: all 0.3s ease;
`;

const Section = styled.div`
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin-bottom: 10px;
`;

const SectionIcon = styled.span`
  color: #FA2D48;
`;

// 完整度进度条
const CompletenessBar = styled.div`
  margin-bottom: 12px;
`;

const ProgressHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
`;

const ProgressLabel = styled.span`
  font-size: 0.75rem;
  color: #86868B;
`;

const ProgressValue = styled.span<{ $value: number }>`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => {
    if (props.$value >= 80) return '#34C759';
    if (props.$value >= 50) return '#FF9500';
    return '#FF3B30';
  }};
`;

const ProgressTrack = styled.div`
  height: 6px;
  background: #F5F5F7;
  border-radius: 3px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $value: number }>`
  height: 100%;
  width: ${props => props.$value}%;
  background: ${props => {
    if (props.$value >= 80) return 'linear-gradient(90deg, #34C759 0%, #30D158 100%)';
    if (props.$value >= 50) return 'linear-gradient(90deg, #FF9500 0%, #FFCC00 100%)';
    return 'linear-gradient(90deg, #FF3B30 0%, #FF6B6B 100%)';
  }};
  border-radius: 3px;
  transition: width 0.3s ease;
`;

// 维度列表
const DimensionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DimensionItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
`;

const DimensionStatus = styled.span<{ $found: boolean }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${props => props.$found ? '#34C759' : '#E5E5EA'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const DimensionLabel = styled.span`
  color: #86868B;
  min-width: 60px;
`;

const DimensionValue = styled.span<{ $found: boolean }>`
  color: ${props => props.$found ? '#1D1D1F' : '#C7C7CC'};
`;

// 建议列表
const SuggestionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SuggestionItem = styled.div`
  padding: 10px 12px;
  background: #F5F5F7;
  border-radius: 10px;
  font-size: 0.8125rem;
  line-height: 1.4;
`;

const SuggestionTitle = styled.div`
  font-weight: 500;
  color: #1D1D1F;
  margin-bottom: 4px;
`;

const SuggestionExamples = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
`;

const ExampleTag = styled.button`
  padding: 3px 8px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  font-size: 0.75rem;
  color: #1D1D1F;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #FA2D48;
    border-color: #FA2D48;
    color: white;
  }
`;

// 风格推荐
const RecommendationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RecommendationItem = styled.div`
  padding: 12px;
  background: linear-gradient(135deg, rgba(250, 45, 72, 0.05) 0%, rgba(255, 255, 255, 0) 100%);
  border: 1px solid rgba(250, 45, 72, 0.1);
  border-radius: 12px;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(250, 45, 72, 0.2);
    background: linear-gradient(135deg, rgba(250, 45, 72, 0.08) 0%, rgba(255, 255, 255, 0) 100%);
  }
`;

const RecommendationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
`;

const RecommendationTags = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const RecommendationTag = styled.span`
  padding: 3px 8px;
  background: white;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #FA2D48;
`;

const ApplyButton = styled.button`
  padding: 4px 10px;
  background: #FA2D48;
  border: none;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #E5283F;
  }
`;

const RecommendationReason = styled.div`
  font-size: 0.75rem;
  color: #86868B;
  line-height: 1.4;
`;

// 优化描述
const OptimizedDescription = styled.div`
  padding: 12px;
  background: #F5F5F7;
  border-radius: 12px;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #1D1D1F;
`;

const ApplyDescriptionButton = styled.button`
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  background: linear-gradient(135deg, #FA2D48 0%, #FF6B6B 100%);
  border: none;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(250, 45, 72, 0.3);
  }
`;

// 空状态
const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  color: #86868B;
  font-size: 0.875rem;
`;

const LoadingState = styled.div`
  padding: 24px;
  text-align: center;
  color: #86868B;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// ============ 组件 ============

interface SkillAssistantPanelProps {
  analysis: DescriptionAnalysis | null;
  isAnalyzing: boolean;
  onApplyStyle?: (genre: string, mood: string) => void;
  onApplyDescription?: (description: string) => void;
  onTagClick?: (tag: string) => void;
}

export const SkillAssistantPanel: React.FC<SkillAssistantPanelProps> = ({
  analysis,
  isAnalyzing,
  onApplyStyle,
  onApplyDescription,
  onTagClick,
}) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = React.useState(false);

  // 获取维度状态
  const getDimensionStatus = (dimension: string) => {
    return analysis?.dimensions[dimension];
  };

  // 渲染完整度分析
  const renderCompleteness = () => {
    if (!analysis) return null;

    return (
      <Section>
        <SectionTitle>
          <SectionIcon><Target size={14} /></SectionIcon>
          {t('skill.descriptionAnalysis', '描述分析')}
        </SectionTitle>
        <CompletenessBar>
          <ProgressHeader>
            <ProgressLabel>{t('skill.completeness', '完整度')}</ProgressLabel>
            <ProgressValue $value={analysis.completeness}>{analysis.completeness}%</ProgressValue>
          </ProgressHeader>
          <ProgressTrack>
            <ProgressFill $value={analysis.completeness} />
          </ProgressTrack>
        </CompletenessBar>
        <DimensionList>
          {['theme', 'mood', 'rhythm', 'instrument', 'style', 'scene'].map(dim => {
            const status = getDimensionStatus(dim);
            const dimLabels: Record<string, string> = {
              theme: t('skill.dimension.theme', '主题'),
              mood: t('skill.dimension.mood', '情绪'),
              rhythm: t('skill.dimension.rhythm', '节奏'),
              instrument: t('skill.dimension.instrument', '乐器'),
              style: t('skill.dimension.style', '风格'),
              scene: t('skill.dimension.scene', '场景'),
            };
            return (
              <DimensionItem key={dim}>
                <DimensionStatus $found={status?.found || false}>
                  {status?.found ? <Check size={10} /> : <X size={10} />}
                </DimensionStatus>
                <DimensionLabel>{dimLabels[dim]}</DimensionLabel>
                <DimensionValue $found={status?.found || false}>
                  {status?.found ? status.value : t('skill.notDescribed', '未描述')}
                </DimensionValue>
              </DimensionItem>
            );
          })}
        </DimensionList>
      </Section>
    );
  };

  // 渲染建议
  const renderSuggestions = () => {
    if (!analysis?.suggestions.length) return null;

    return (
      <Section>
        <SectionTitle>
          <SectionIcon><Lightbulb size={14} /></SectionIcon>
          {t('skill.suggestions', '改进建议')}
        </SectionTitle>
        <SuggestionList>
          {analysis.suggestions.slice(0, 3).map((suggestion, index) => (
            <SuggestionItem key={index}>
              <SuggestionTitle>{suggestion.message}</SuggestionTitle>
              {suggestion.examples && suggestion.examples.length > 0 && (
                <SuggestionExamples>
                  {suggestion.examples.slice(0, 4).map((example, i) => (
                    <ExampleTag
                      key={i}
                      onClick={() => onTagClick?.(example)}
                    >
                      {example}
                    </ExampleTag>
                  ))}
                </SuggestionExamples>
              )}
            </SuggestionItem>
          ))}
        </SuggestionList>
      </Section>
    );
  };

  // 渲染风格推荐
  const renderRecommendations = () => {
    if (!analysis?.recommendedStyles.length) return null;

    return (
      <Section>
        <SectionTitle>
          <SectionIcon><Target size={14} /></SectionIcon>
          {t('skill.styleRecommendations', '风格推荐')}
        </SectionTitle>
        <RecommendationList>
          {analysis.recommendedStyles.slice(0, 3).map((rec, index) => (
            <RecommendationItem key={index}>
              <RecommendationHeader>
                <RecommendationTags>
                  <RecommendationTag>{rec.genre}</RecommendationTag>
                  <RecommendationTag>{rec.mood}</RecommendationTag>
                </RecommendationTags>
                <ApplyButton onClick={() => onApplyStyle?.(rec.genre, rec.mood)}>
                  {t('skill.apply', '应用')}
                </ApplyButton>
              </RecommendationHeader>
              <RecommendationReason>{rec.reason}</RecommendationReason>
            </RecommendationItem>
          ))}
        </RecommendationList>
      </Section>
    );
  };

  // 渲染优化描述
  const renderOptimizedDescription = () => {
    if (!analysis?.optimizedDescription) return null;

    return (
      <Section>
        <SectionTitle>
          <SectionIcon><Wand2 size={14} /></SectionIcon>
          {t('skill.optimizedDescription', '优化后的描述')}
        </SectionTitle>
        <OptimizedDescription>
          {analysis.optimizedDescription}
        </OptimizedDescription>
        <ApplyDescriptionButton onClick={() => onApplyDescription?.(analysis.optimizedDescription!)}>
          <Wand2 size={14} />
          {t('skill.applyDescription', '应用此描述')}
        </ApplyDescriptionButton>
      </Section>
    );
  };

  // 渲染内容
  const renderContent = () => {
    if (isAnalyzing) {
      return (
        <LoadingState>
          <RefreshCw size={16} className="spin" />
          {t('skill.analyzing', '正在分析...')}
        </LoadingState>
      );
    }

    if (!analysis) {
      return (
        <EmptyState>
          {t('skill.emptyHint', '输入描述后，我将实时分析并提供建议')}
        </EmptyState>
      );
    }

    return (
      <>
        {renderCompleteness()}
        {renderSuggestions()}
        {renderRecommendations()}
        {renderOptimizedDescription()}
      </>
    );
  };

  return (
    <PanelContainer $collapsed={collapsed}>
      <PanelHeader onClick={() => setCollapsed(!collapsed)}>
        <HeaderLeft>
          <HeaderIcon>
            <Sparkles size={14} />
          </HeaderIcon>
          <HeaderTitle>{t('skill.assistantTitle', '创作助手')}</HeaderTitle>
          {analysis && !isAnalyzing && (
            <HeaderBadge>{analysis.completeness}%</HeaderBadge>
          )}
        </HeaderLeft>
        <CollapseButton>
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </CollapseButton>
      </PanelHeader>
      <PanelContent $collapsed={collapsed}>
        {renderContent()}
      </PanelContent>
    </PanelContainer>
  );
};

export default SkillAssistantPanel;

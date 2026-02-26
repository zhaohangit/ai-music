/**
 * 智能输入组件
 * 提供实时输入提示和快捷标签
 */

import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Lightbulb, ChevronRight } from 'lucide-react';
import { QuickTag } from '../../services/skill/types';
import { getGroupedQuickTags } from '../../hooks/useSkillAssistant';

// ============ 样式组件 ============

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StyledTextarea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 16px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: #1D1D1F;
  resize: vertical;
  transition: all 0.2s ease;

  &::placeholder {
    color: #86868B;
  }

  &:focus {
    outline: none;
    border-color: #FA2D48;
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.1);
  }
`;

const SuggestionsPanel = styled.div<{ $visible: boolean }>`
  padding: 14px 16px;
  background: #F5F5F7;
  border-radius: 12px;
  opacity: ${props => props.$visible ? 1 : 0};
  max-height: ${props => props.$visible ? '300px' : '0'};
  overflow: hidden;
  transition: all 0.3s ease;
  margin-top: ${props => props.$visible ? '0' : '-12px'};
`;

const SuggestionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #86868B;
  margin-bottom: 10px;
`;

const TagsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const QuickTagButton = styled.button<{ $active?: boolean }>`
  padding: 5px 10px;
  background: ${props => props.$active ? '#FA2D48' : '#FFFFFF'};
  border: 1px solid ${props => props.$active ? '#FA2D48' : 'rgba(0, 0, 0, 0.08)'};
  border-radius: 14px;
  font-size: 0.75rem;
  color: ${props => props.$active ? 'white' : '#1D1D1F'};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$active ? '#E5283F' : 'rgba(250, 45, 72, 0.08)'};
    border-color: ${props => props.$active ? '#E5283F' : 'rgba(250, 45, 72, 0.2)'};
    transform: translateY(-1px);
  }
`;

const ExampleSection = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
`;

const ExampleItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #FFFFFF;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: rgba(250, 45, 72, 0.05);
  }
`;

const ExampleText = styled.span`
  flex: 1;
  font-size: 0.8125rem;
  color: #1D1D1F;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ExampleAction = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  color: #FA2D48;
  font-weight: 500;
  font-size: 0.75rem;
  flex-shrink: 0;
`;

// 示例描述列表
const exampleDescriptions = [
  '一首欢快的夏日流行歌曲，节奏明快，吉他伴奏，充满阳光和活力',
  '一首浪漫的爱情民谣，轻柔的钢琴旋律，适合夜晚独自聆听',
  '一首充满力量的摇滚歌曲，快节奏，电吉他主导，适合运动时听',
];

// ============ 组件 ============

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onAnalyze?: (value: string) => void;
  disabled?: boolean;
}

export const SmartInput: React.FC<SmartInputProps> = ({
  value,
  onChange,
  placeholder,
  onAnalyze,
  disabled,
}) => {
  const { t } = useTranslation();
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);

  const groupedTags = getGroupedQuickTags();
  const showSuggestions = !value.trim();

  // 处理标签点击
  const handleTagClick = (tag: QuickTag) => {
    const tagValue = tag.value;
    let newValue = value;

    if (selectedTags.includes(tagValue)) {
      // 移除标签
      setSelectedTags(prev => prev.filter(t => t !== tagValue));
      newValue = value.replace(new RegExp(`${tagValue}[，,]?\\s*`, 'g'), '').trim();
    } else {
      // 添加标签
      setSelectedTags(prev => [...prev, tagValue]);
      newValue = value.trim()
        ? `${value}，${tagValue}`
        : tagValue;
    }

    onChange(newValue);
    onAnalyze?.(newValue);
  };

  // 处理示例描述点击
  const handleExampleClick = (example: string) => {
    onChange(example);
    onAnalyze?.(example);
  };

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    onAnalyze?.(newValue);
  };

  return (
    <Container>
      <StyledTextarea
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder || t('create.promptPlaceholder', '描述你想要的音乐...')}
        disabled={disabled}
      />

      <SuggestionsPanel $visible={showSuggestions}>
        <SuggestionHeader>
          <Lightbulb size={12} />
          {t('skill.tryAdding', '试试添加：')}
        </SuggestionHeader>

        {/* 情绪标签 */}
        <TagsRow>
          {groupedTags.mood.slice(0, 6).map(tag => (
            <QuickTagButton
              key={tag.value}
              $active={selectedTags.includes(tag.value)}
              onClick={() => handleTagClick(tag)}
              type="button"
            >
              {tag.label}
            </QuickTagButton>
          ))}
        </TagsRow>

        {/* 节奏 + 乐器标签 */}
        <TagsRow>
          {groupedTags.rhythm.slice(0, 4).map(tag => (
            <QuickTagButton
              key={tag.value}
              $active={selectedTags.includes(tag.value)}
              onClick={() => handleTagClick(tag)}
              type="button"
            >
              {tag.label}
            </QuickTagButton>
          ))}
          {groupedTags.instrument.slice(0, 4).map(tag => (
            <QuickTagButton
              key={tag.value}
              $active={selectedTags.includes(tag.value)}
              onClick={() => handleTagClick(tag)}
              type="button"
            >
              {tag.label}
            </QuickTagButton>
          ))}
        </TagsRow>

        {/* 示例描述 */}
        <ExampleSection>
          <SuggestionHeader>
            <ChevronRight size={12} />
            {t('skill.exampleDescriptions', '参考描述：')}
          </SuggestionHeader>
          {exampleDescriptions.slice(0, 2).map((example, index) => (
            <ExampleItem
              key={index}
              onClick={() => handleExampleClick(example)}
            >
              <ExampleText>{example}</ExampleText>
              <ExampleAction>
                {t('skill.use', '使用')}
                <ChevronRight size={12} />
              </ExampleAction>
            </ExampleItem>
          ))}
        </ExampleSection>
      </SuggestionsPanel>
    </Container>
  );
};

export default SmartInput;

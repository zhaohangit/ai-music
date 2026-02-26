/**
 * 引导式创作组件
 * 通过多步骤问答引导用户完成音乐描述
 */

import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  X,
  Music,
  Heart,
  Zap,
  Piano,
  MapPin,
} from 'lucide-react';
import { GuidedStep, GuidedResult } from '../../services/skill/types';

// ============ 样式组件 ============

const Overlay = styled.div<{ $visible: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: ${props => props.$visible ? 1 : 0};
  pointer-events: ${props => props.$visible ? 'auto' : 'none'};
  transition: opacity 0.3s ease;
`;

const Modal = styled.div`
  width: 90%;
  max-width: 520px;
  max-height: 90vh;
  background: #FFFFFF;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const ModalHeader = styled.div`
  padding: 20px 24px;
  background: linear-gradient(135deg, #FA2D48 0%, #FF6B6B 100%);
  color: white;
  position: relative;
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const HeaderIcon = styled.div`
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.h2`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
`;

const HeaderSubtitle = styled.p`
  margin: 4px 0 0 0;
  font-size: 0.8125rem;
  opacity: 0.9;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 8px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const ProgressContainer = styled.div`
  padding: 16px 24px;
  background: #F5F5F7;
`;

const ProgressBar = styled.div`
  height: 4px;
  background: #E5E5EA;
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $progress: number }>`
  height: 100%;
  width: ${props => props.$progress}%;
  background: linear-gradient(90deg, #FA2D48 0%, #FF6B6B 100%);
  transition: width 0.3s ease;
`;

const ProgressText = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 0.75rem;
  color: #86868B;
`;

const ModalBody = styled.div`
  padding: 24px;
  max-height: 400px;
  overflow-y: auto;
`;

const StepTitle = styled.h3`
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
  color: #1D1D1F;
`;

const StepQuestion = styled.p`
  margin: 0 0 16px 0;
  font-size: 0.875rem;
  color: #86868B;
`;

const OptionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
`;

const OptionButton = styled.button<{ $selected: boolean }>`
  padding: 12px 8px;
  background: ${props => props.$selected ? '#FA2D48' : '#F5F5F7'};
  border: 2px solid ${props => props.$selected ? '#FA2D48' : 'transparent'};
  border-radius: 12px;
  font-size: 0.8125rem;
  color: ${props => props.$selected ? 'white' : '#1D1D1F'};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$selected ? '#E5283F' : '#E8E8ED'};
    border-color: ${props => props.$selected ? '#E5283F' : 'rgba(0, 0, 0, 0.05)'};
  }
`;

const OptionIcon = styled.span`
  font-size: 1.25rem;
`;

const OptionLabel = styled.span`
  font-weight: 500;
`;

// 单选组
const RadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const RadioOption = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: ${props => props.$selected ? 'rgba(250, 45, 72, 0.08)' : '#F5F5F7'};
  border: 2px solid ${props => props.$selected ? '#FA2D48' : 'transparent'};
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$selected ? 'rgba(250, 45, 72, 0.12)' : '#E8E8ED'};
  }
`;

const RadioIcon = styled.div<{ $selected: boolean }>`
  width: 20px;
  height: 20px;
  border: 2px solid ${props => props.$selected ? '#FA2D48' : '#C7C7CC'};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;

  ${props => props.$selected && `
    &::after {
      content: '';
      width: 10px;
      height: 10px;
      background: #FA2D48;
      border-radius: 50%;
    }
  `}
`;

const RadioContent = styled.div`
  flex: 1;
`;

const RadioTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #1D1D1F;
`;

const RadioDescription = styled.div`
  font-size: 0.75rem;
  color: #86868B;
  margin-top: 2px;
`;

// 多选组
const CheckboxGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
`;

const CheckboxOption = styled.button<{ $selected: boolean }>`
  padding: 10px 12px;
  background: ${props => props.$selected ? 'rgba(250, 45, 72, 0.08)' : '#F5F5F7'};
  border: 2px solid ${props => props.$selected ? '#FA2D48' : 'transparent'};
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${props => props.$selected ? '#FA2D48' : '#1D1D1F'};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$selected ? 'rgba(250, 45, 72, 0.12)' : '#E8E8ED'};
  }
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  background: #F5F5F7;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  font-size: 0.875rem;
  color: #1D1D1F;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #F5F5F7;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const NextButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #FA2D48 0%, #FF6B6B 100%);
  border: none;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(250, 45, 72, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

// 结果展示
const ResultSection = styled.div`
  margin-bottom: 20px;
`;

const ResultLabel = styled.div`
  font-size: 0.75rem;
  color: #86868B;
  margin-bottom: 6px;
`;

const ResultValue = styled.div`
  font-size: 0.9375rem;
  color: #1D1D1F;
  line-height: 1.6;
  padding: 12px;
  background: #F5F5F7;
  border-radius: 10px;
`;

const RecommendedSettings = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 12px;
`;

const SettingBadge = styled.div`
  padding: 6px 12px;
  background: rgba(250, 45, 72, 0.1);
  border-radius: 8px;
  font-size: 0.8125rem;
  color: #FA2D48;
  font-weight: 500;
`;

// ============ 步骤配置 ============

const guidedSteps: GuidedStep[] = [
  {
    id: 'theme',
    title: '歌曲主题',
    question: '这首歌是关于什么的？',
    options: [
      { label: '夏天', value: '夏天', icon: '☀️' },
      { label: '爱情', value: '爱情', icon: '❤️' },
      { label: '友情', value: '友情', icon: '🤝' },
      { label: '回忆', value: '回忆', icon: '📷' },
      { label: '梦想', value: '梦想', icon: '🌟' },
      { label: '旅行', value: '旅行', icon: '✈️' },
      { label: '成长', value: '成长', icon: '🌱' },
      { label: '夜晚', value: '夜晚', icon: '🌙' },
      { label: '自由', value: '自由', icon: '🕊️' },
    ],
  },
  {
    id: 'mood',
    title: '情绪氛围',
    question: '想要什么情绪？',
    options: [
      { label: '欢快', value: '欢快', icon: '😊' },
      { label: '放松', value: '放松', icon: '😌' },
      { label: '浪漫', value: '浪漫', icon: '💕' },
      { label: '激情', value: '激情', icon: '🔥' },
      { label: '忧郁', value: '忧郁', icon: '🌧️' },
      { label: '温暖', value: '温暖', icon: '☀️' },
    ],
  },
  {
    id: 'rhythm',
    title: '节奏快慢',
    question: '节奏是怎样的？',
    options: [
      { label: '快节奏', value: '快节奏', icon: '⚡' },
      { label: '中等节奏', value: '中等节奏', icon: '🎵' },
      { label: '慢节奏', value: '慢节奏', icon: '🌙' },
      { label: '律动感', value: '律动感', icon: '💃' },
    ],
    multiSelect: false,
  },
  {
    id: 'instrument',
    title: '主要乐器',
    question: '想要什么乐器？',
    options: [
      { label: '吉他', value: '吉他', icon: '🎸' },
      { label: '钢琴', value: '钢琴', icon: '🎹' },
      { label: '电子', value: '电子', icon: '🎛️' },
      { label: '弦乐', value: '弦乐', icon: '🎻' },
      { label: '鼓组', value: '鼓组', icon: '🥁' },
      { label: '萨克斯', value: '萨克斯', icon: '🎷' },
    ],
    multiSelect: true,
  },
  {
    id: 'scene',
    title: '使用场景',
    question: '在什么场景下听？',
    options: [
      { label: '海边', value: '海边', icon: '🏖️' },
      { label: '驾车', value: '驾车', icon: '🚗' },
      { label: '运动', value: '运动', icon: '🏃' },
      { label: '睡前', value: '睡前', icon: '😴' },
      { label: '派对', value: '派对', icon: '🎉' },
      { label: '约会', value: '约会', icon: '🌹' },
    ],
    multiSelect: true,
  },
];

// ============ 组件 ============

interface GuidedCreationProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (result: GuidedResult) => void;
}

export const GuidedCreation: React.FC<GuidedCreationProps> = ({
  visible,
  onClose,
  onComplete,
}) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string | string[]>>({});

  // 计算进度
  const progress = ((currentStep + 1) / guidedSteps.length) * 100;
  const step = guidedSteps[currentStep];
  const isLastStep = currentStep === guidedSteps.length - 1;
  const isFirstStep = currentStep === 0;

  // 处理单选
  const handleSingleSelect = useCallback((value: string) => {
    setSelections(prev => ({
      ...prev,
      [step.id]: value,
    }));
  }, [step.id]);

  // 处理多选
  const handleMultiSelect = useCallback((value: string) => {
    setSelections(prev => {
      const current = (prev[step.id] as string[]) || [];
      const exists = current.includes(value);
      return {
        ...prev,
        [step.id]: exists
          ? current.filter(v => v !== value)
          : [...current, value],
      };
    });
  }, [step.id]);

  // 检查当前步骤是否有选择
  const hasSelection = useCallback(() => {
    const value = selections[step.id];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return !!value;
  }, [selections, step.id]);

  // 下一步
  const handleNext = useCallback(() => {
    if (isLastStep) {
      // 生成结果
      const result = generateResult();
      onComplete(result);
      resetState();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }, [isLastStep, onComplete]);

  // 上一步
  const handleBack = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  }, [isFirstStep]);

  // 生成结果
  const generateResult = useCallback((): GuidedResult => {
    const theme = selections['theme'] as string;
    const mood = selections['mood'] as string;
    const rhythm = selections['rhythm'] as string;
    const instruments = selections['instrument'] as string[];
    const scene = selections['scene'] as string[];

    // 生成描述
    const parts: string[] = [];
    if (mood) parts.push(mood);
    if (theme) parts.push(`关于${theme}`);
    parts.push('歌曲');
    if (rhythm) parts.push(rhythm);
    if (instruments && instruments.length > 0) {
      parts.push(`${instruments.join('、')}伴奏`);
    }
    if (scene && scene.length > 0) {
      parts.push(`适合${scene.join('、')}`);
    }

    const generatedDescription = parts.join('，') + '。';

    // 推荐设置
    let recommendedGenre = 'Pop';
    let recommendedMood = 'Energetic';

    if (theme) {
      const themeLower = theme.toLowerCase();
      if (['夏天', '旅行', '自由'].includes(themeLower)) {
        recommendedGenre = 'Pop';
        recommendedMood = 'Energetic';
      } else if (['爱情', '浪漫'].includes(themeLower)) {
        recommendedGenre = 'R&B';
        recommendedMood = 'Romantic';
      } else if (['回忆', '忧郁'].includes(themeLower)) {
        recommendedGenre = 'Folk';
        recommendedMood = 'Melancholic';
      } else if (['夜晚'].includes(themeLower)) {
        recommendedGenre = 'Jazz';
        recommendedMood = 'Relaxing';
      }
    }

    return {
      theme,
      mood,
      rhythm,
      instruments,
      scene: Array.isArray(scene) ? scene[0] : scene,
      generatedDescription,
      recommendedSettings: {
        genre: recommendedGenre,
        mood: recommendedMood,
      },
    };
  }, [selections]);

  // 重置状态
  const resetState = useCallback(() => {
    setCurrentStep(0);
    setSelections({});
  }, []);

  // 关闭时重置
  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // 渲染选项
  const renderOptions = () => {
    const currentValue = selections[step.id];

    if (step.multiSelect) {
      const selectedValues = (currentValue as string[]) || [];
      return (
        <CheckboxGroup>
          {step.options.map(option => (
            <CheckboxOption
              key={option.value}
              $selected={selectedValues.includes(option.value)}
              onClick={() => handleMultiSelect(option.value)}
              type="button"
            >
              {option.icon && <span>{option.icon}</span>}
              {option.label}
            </CheckboxOption>
          ))}
        </CheckboxGroup>
      );
    }

    return (
      <OptionsGrid>
        {step.options.map(option => (
          <OptionButton
            key={option.value}
            $selected={currentValue === option.value}
            onClick={() => handleSingleSelect(option.value)}
            type="button"
          >
            {option.icon && <OptionIcon>{option.icon}</OptionIcon>}
            <OptionLabel>{option.label}</OptionLabel>
          </OptionButton>
        ))}
      </OptionsGrid>
    );
  };

  // 渲染结果
  const renderResult = () => {
    const result = generateResult();

    return (
      <>
        <StepTitle>{t('guided.resultTitle', '完成！这是你的音乐描述')}</StepTitle>
        <StepQuestion>{t('guided.resultSubtitle', '确认以下内容或返回修改')}</StepQuestion>

        <ResultSection>
          <ResultLabel>{t('guided.generatedDescription', '生成的描述')}</ResultLabel>
          <ResultValue>{result.generatedDescription}</ResultValue>
        </ResultSection>

        <ResultSection>
          <ResultLabel>{t('guided.recommendedSettings', '推荐设置')}</ResultLabel>
          <RecommendedSettings>
            <SettingBadge>风格: {result.recommendedSettings.genre}</SettingBadge>
            <SettingBadge>情绪: {result.recommendedSettings.mood}</SettingBadge>
          </RecommendedSettings>
        </ResultSection>
      </>
    );
  };

  return (
    <Overlay $visible={visible} onClick={handleClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <HeaderContent>
            <HeaderIcon>
              <Sparkles size={20} />
            </HeaderIcon>
            <div>
              <HeaderTitle>{t('guided.title', '让我帮你完善音乐创意')}</HeaderTitle>
              <HeaderSubtitle>{t('guided.subtitle', '回答几个问题，生成专业描述')}</HeaderSubtitle>
            </div>
          </HeaderContent>
          <CloseButton onClick={handleClose}>
            <X size={18} />
          </CloseButton>
        </ModalHeader>

        <ProgressContainer>
          <ProgressBar>
            <ProgressFill $progress={progress} />
          </ProgressBar>
          <ProgressText>
            <span>{t('guided.step', '步骤 {{current}}/{{total}}', { current: currentStep + 1, total: guidedSteps.length })}</span>
            <span>{step.title}</span>
          </ProgressText>
        </ProgressContainer>

        <ModalBody>
          {isLastStep && hasSelection() ? renderResult() : (
            <>
              <StepTitle>{step.title}</StepTitle>
              <StepQuestion>{step.question}</StepQuestion>
              {renderOptions()}
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <BackButton onClick={handleBack} disabled={isFirstStep}>
            <ChevronLeft size={16} />
            {t('guided.back', '上一步')}
          </BackButton>
          <NextButton onClick={handleNext} disabled={!hasSelection()}>
            {isLastStep ? t('guided.complete', '完成') : t('guided.next', '下一步')}
            {!isLastStep && <ChevronRight size={16} />}
          </NextButton>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
};

export default GuidedCreation;

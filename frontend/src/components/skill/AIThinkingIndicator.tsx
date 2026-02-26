/**
 * AI 思考指示器组件
 * 展示 AI 分析/生成过程的动态状态
 */

import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { useTranslation } from 'react-i18next';

// 动画
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// 样式
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: linear-gradient(135deg, rgba(250, 45, 72, 0.03) 0%, rgba(255, 255, 255, 0) 100%);
  border-radius: 16px;
  border: 1px solid rgba(250, 45, 72, 0.1);
`;

const IconContainer = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  margin-bottom: 20px;
`;

const IconRing = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 2px solid rgba(250, 45, 72, 0.2);
  border-radius: 50%;
  animation: ${pulse} 2s ease-in-out infinite;
`;

const IconRing2 = styled(IconRing)`
  top: 8px;
  left: 8px;
  right: 8px;
  bottom: 8px;
  border-color: rgba(250, 45, 72, 0.3);
  animation-delay: 0.3s;
`;

const IconCenter = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #FA2D48 0%, #FF6B6B 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${float} 2s ease-in-out infinite;
  box-shadow: 0 4px 20px rgba(250, 45, 72, 0.3);
`;

const StatusText = styled.div`
  font-size: 0.9375rem;
  font-weight: 500;
  color: #1D1D1F;
  margin-bottom: 8px;
`;

const ProgressSteps = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
`;

const ProgressStep = styled.div<{ $active: boolean; $completed: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.$completed ? '#34C759' : props.$active ? '#FA2D48' : '#E5E5EA'};
  transition: all 0.3s ease;
  ${props => props.$active && `
    animation: ${pulse} 1s ease-in-out infinite;
  `}
`;

const ThinkingText = styled.div`
  font-size: 0.8125rem;
  color: #86868B;
  margin-top: 12px;
  animation: ${pulse} 1.5s ease-in-out infinite;
`;

const ShimmerBar = styled.div`
  width: 120px;
  height: 4px;
  background: linear-gradient(90deg, #E5E5EA 0%, #FA2D48 50%, #E5E5EA 100%);
  background-size: 200% 100%;
  animation: ${shimmer} 2s linear infinite;
  border-radius: 2px;
  margin-top: 16px;
`;

// AI 思考阶段
const thinkingStages = [
  { text: '正在分析你的创意...', duration: 1500 },
  { text: '理解音乐风格...', duration: 2000 },
  { text: '构建旋律框架...', duration: 2500 },
  { text: '生成和声进行...', duration: 3000 },
  { text: '优化音色搭配...', duration: 2000 },
  { text: '最终混音处理...', duration: 1500 },
];

interface AIThinkingIndicatorProps {
  visible: boolean;
  mode?: 'music' | 'lyrics' | 'enhance' | 'polish';
}

export const AIThinkingIndicator: React.FC<AIThinkingIndicatorProps> = ({
  visible,
  mode = 'music',
}) => {
  const { t } = useTranslation();
  const [currentStage, setCurrentStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!visible) {
      setCurrentStage(0);
      setElapsed(0);
      return;
    }

    // 阶段轮换
    const stageInterval = setInterval(() => {
      setCurrentStage(prev => (prev + 1) % thinkingStages.length);
    }, 2500);

    // 计时
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(stageInterval);
      clearInterval(timer);
    };
  }, [visible]);

  if (!visible) return null;

  const getModeText = () => {
    switch (mode) {
      case 'lyrics':
        return t('ai.thinking.lyrics', 'AI 正在创作歌词');
      case 'enhance':
        return t('ai.thinking.enhance', 'AI 正在增强描述');
      case 'polish':
        return t('ai.thinking.polish', 'AI 正在润色歌词');
      default:
        return t('ai.thinking.music', 'AI 正在创作音乐');
    }
  };

  return (
    <Container>
      <IconContainer>
        <IconRing />
        <IconRing2 />
        <IconCenter>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </IconCenter>
      </IconContainer>

      <StatusText>{getModeText()}</StatusText>

      <ThinkingText>
        {thinkingStages[currentStage].text}
      </ThinkingText>

      <ProgressSteps>
        {thinkingStages.map((_, index) => (
          <ProgressStep
            key={index}
            $active={index === currentStage}
            $completed={index < currentStage}
          />
        ))}
      </ProgressSteps>

      <ShimmerBar />

      {elapsed > 5 && (
        <ThinkingText style={{ marginTop: '8px', fontSize: '0.75rem' }}>
          {t('ai.thinking.elapsed', '已处理 {{time}} 秒', { time: elapsed })}
        </ThinkingText>
      )}
    </Container>
  );
};

export default AIThinkingIndicator;

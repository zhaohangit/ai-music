import React from 'react';
import styled, { keyframes } from 'styled-components';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  fullScreen?: boolean;
  variant?: 'default' | 'dots' | 'bars' | 'pulse';
  progress?: number;
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.95); }
`;

const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
`;

const wave = keyframes`
  0%, 40%, 100% { transform: scaleY(0.4); }
  20% { transform: scaleY(1); }
`;

const glow = keyframes`
  0%, 100% {
    box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 40px rgba(102, 126, 234, 0.6);
    transform: scale(1.05);
  }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const getSize = (size: 'small' | 'medium' | 'large'): string => {
  switch (size) {
    case 'small':
      return '24px';
    case 'medium':
      return '40px';
    case 'large':
      return '64px';
    default:
      return '40px';
  }
};

const getStrokeWidth = (size: 'small' | 'medium' | 'large'): number => {
  switch (size) {
    case 'small':
      return 2;
    case 'medium':
      return 3;
    case 'large':
      return 4;
    default:
      return 3;
  }
};

const SpinnerContainer = styled.div<{ $fullScreen: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  animation: ${fadeIn} 0.3s ease-out;
  ${props => props.$fullScreen && `
    position: fixed;
    inset: 0;
    background: rgba(26, 26, 46, 0.95);
    backdrop-filter: blur(12px);
    z-index: 9999;
  `}
`;

const SpinnerSVG = styled.svg<{ $size: 'small' | 'medium' | 'large' }>`
  width: ${props => getSize(props.$size)};
  height: ${props => getSize(props.$size)};
  animation: ${spin} 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  filter: drop-shadow(0 0 10px rgba(102, 126, 234, 0.4));
`;

const LoadingText = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: #8B8B9F;
  animation: ${pulse} 1.5s ease-in-out infinite;
  text-align: center;
`;

// Dots variant
const DotsContainer = styled.div`
  display: flex;
  gap: 8px;
`;

const Dot = styled.div<{ $delay: number; $size: 'small' | 'medium' | 'large' }>`
  width: ${props => props.$size === 'small' ? '8px' : props.$size === 'large' ? '16px' : '12px'};
  height: ${props => props.$size === 'small' ? '8px' : props.$size === 'large' ? '16px' : '12px'};
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border-radius: 50%;
  animation: ${bounce} 1.4s ease-in-out infinite;
  animation-delay: ${props => props.$delay}s;
`;

// Bars variant
const BarsContainer = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
  height: 40px;
`;

const Bar = styled.div<{ $delay: number }>`
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #667EEA, #764BA2);
  border-radius: 2px;
  animation: ${wave} 1.2s ease-in-out infinite;
  animation-delay: ${props => props.$delay}s;
  transform-origin: bottom;
`;

// Pulse variant
const PulseCircle = styled.div<{ $size: 'small' | 'medium' | 'large' }>`
  width: ${props => getSize(props.$size)};
  height: ${props => getSize(props.$size)};
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border-radius: 50%;
  animation: ${glow} 1.5s ease-in-out infinite;
`;

// Progress bar
const ProgressContainer = styled.div`
  width: 200px;
  margin-top: 8px;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: linear-gradient(90deg, #667EEA, #764BA2);
  border-radius: 2px;
  transition: width 0.3s ease;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.3) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: ${shimmer} 1.5s infinite;
  }
`;

const ProgressText = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 0.75rem;
  color: #8B8B9F;
`;

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  text,
  fullScreen = false,
  variant = 'default',
  progress,
}) => {
  const renderSpinner = () => {
    switch (variant) {
      case 'dots':
        return (
          <DotsContainer>
            {[0, 0.16, 0.32].map((delay, i) => (
              <Dot key={i} $delay={delay} $size={size} />
            ))}
          </DotsContainer>
        );
      case 'bars':
        return (
          <BarsContainer>
            {[0, 0.1, 0.2, 0.3, 0.4].map((delay, i) => (
              <Bar key={i} $delay={delay} />
            ))}
          </BarsContainer>
        );
      case 'pulse':
        return <PulseCircle $size={size} />;
      default:
        return (
          <SpinnerSVG $size={size} viewBox="0 0 50 50">
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth={getStrokeWidth(size)}
              strokeLinecap="round"
              strokeDasharray="31.4 31.4"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#667EEA" />
                <stop offset="100%" stopColor="#764BA2" />
              </linearGradient>
            </defs>
          </SpinnerSVG>
        );
    }
  };

  return (
    <SpinnerContainer $fullScreen={fullScreen}>
      {renderSpinner()}
      {text && <LoadingText>{text}</LoadingText>}
      {progress !== undefined && (
        <ProgressContainer>
          <ProgressBar>
            <ProgressFill $progress={progress} />
          </ProgressBar>
          <ProgressText>
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </ProgressText>
        </ProgressContainer>
      )}
    </SpinnerContainer>
  );
};

export default LoadingSpinner;

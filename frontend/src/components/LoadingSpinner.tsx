import React from 'react';
import styled, { keyframes } from 'styled-components';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  fullScreen?: boolean;
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
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
  ${props => props.$fullScreen && `
    position: fixed;
    inset: 0;
    background: rgba(26, 26, 46, 0.9);
    backdrop-filter: blur(8px);
    z-index: 9999;
  `}
`;

const SpinnerSVG = styled.svg<{ $size: 'small' | 'medium' | 'large' }>`
  width: ${props => getSize(props.$size)};
  height: ${props => getSize(props.$size)};
  animation: ${spin} 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
`;

const LoadingText = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: #8B8B9F;
  animation: ${pulse} 1.5s ease-in-out infinite;
`;

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  text,
  fullScreen = false,
}) => {
  return (
    <SpinnerContainer $fullScreen={fullScreen}>
      <SpinnerSVG
        $size={size}
        viewBox="0 0 50 50"
      >
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
      {text && <LoadingText>{text}</LoadingText>}
    </SpinnerContainer>
  );
};

export default LoadingSpinner;

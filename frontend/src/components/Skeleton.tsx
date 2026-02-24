import React from 'react';
import styled, { keyframes } from 'styled-components';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  variant?: 'rect' | 'circle' | 'text';
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

const SkeletonBase = styled.div<{
  $width: string | number;
  $height: string | number;
  $borderRadius: string | number;
  $variant: 'rect' | 'circle' | 'text';
}>`
  width: ${props => typeof props.$width === 'number' ? `${props.$width}px` : props.$width};
  height: ${props => typeof props.$height === 'number' ? `${props.$height}px` : props.$height};
  border-radius: ${props => {
    if (props.$variant === 'circle') return '50%';
    if (props.$variant === 'text') return '4px';
    return typeof props.$borderRadius === 'number'
      ? `${props.$borderRadius}px`
      : props.$borderRadius;
  }};
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.05) 100%
  );
  background-size: 200% 100%;
  animation: ${pulse} 1.5s ease-in-out infinite;
`;

const SkeletonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = '8px',
  variant = 'rect',
  count = 1,
  className,
}) => {
  if (count > 1) {
    return (
      <SkeletonContainer className={className}>
        {Array.from({ length: count }).map((_, index) => (
          <SkeletonBase
            key={index}
            $width={width}
            $height={height}
            $borderRadius={borderRadius}
            $variant={variant}
          />
        ))}
      </SkeletonContainer>
    );
  }

  return (
    <SkeletonBase
      className={className}
      $width={width}
      $height={height}
      $borderRadius={borderRadius}
      $variant={variant}
    />
  );
};

// Pre-configured skeleton components for common use cases

export const SkeletonCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const SkeletonMusicCard: React.FC = () => {
  return (
    <SkeletonCard>
      <Skeleton width="100%" height="100%" variant="rect" style={{ aspectRatio: '1' }} />
      <Skeleton width="80%" height="20px" borderRadius="4px" />
      <div style={{ display: 'flex', gap: '8px' }}>
        <Skeleton width="60px" height="24px" borderRadius="4px" />
        <Skeleton width="40px" height="24px" borderRadius="4px" />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <Skeleton width="100%" height="32px" borderRadius="8px" />
        <Skeleton width="100%" height="32px" borderRadius="8px" />
        <Skeleton width="100%" height="32px" borderRadius="8px" />
      </div>
    </SkeletonCard>
  );
};

export const SkeletonList: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px' }}>
          <Skeleton width="48px" height="48px" variant="rect" borderRadius="8px" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Skeleton width="70%" height="16px" borderRadius="4px" />
            <Skeleton width="40%" height="14px" borderRadius="4px" />
          </div>
          <Skeleton width="32px" height="32px" variant="circle" />
        </div>
      ))}
    </div>
  );
};

export const SkeletonText: React.FC<{ lines?: number; width?: string }> = ({ lines = 3, width = '100%' }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? '60%' : width}
          height="16px"
          borderRadius="4px"
          variant="text"
        />
      ))}
    </div>
  );
};

export default Skeleton;

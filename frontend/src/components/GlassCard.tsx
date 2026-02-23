import React from 'react';
import styled from 'styled-components';

export interface GlassCardProps {
  children: React.ReactNode;
  padding?: string;
  onClick?: () => void;
  className?: string;
}

const StyledGlassCard = styled.div<GlassCardProps>`
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 24px;
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  padding: ${props => props.padding || '24px'};
  cursor: ${props => props.onClick ? 'pointer' : 'default'};
  transition: all 0.3s ease;

  &:hover {
    ${props => props.onClick && `
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.25);
      transform: translateY(-2px);
    `}
  }

  &:active {
    ${props => props.onClick && `
      transform: translateY(0);
    `}
  }
`;

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  padding,
  onClick,
  className
}) => {
  return (
    <StyledGlassCard
      padding={padding}
      onClick={onClick}
      className={className}
    >
      {children}
    </StyledGlassCard>
  );
};

export default GlassCard;

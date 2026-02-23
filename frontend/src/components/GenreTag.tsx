import React from 'react';
import styled, { css } from 'styled-components';

export interface GenreTagProps {
  selected?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const StyledGenreTag = styled.button<GenreTagProps>`
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 20px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  background: transparent;
  color: ${props => props.selected ? '#667EEA' : '#FFFFFF'};

  ${props => {
    if (props.selected) {
      return css`
        background: rgba(102, 126, 234, 0.2);
        border-color: #667EEA;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      `;
    }
    return css`
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
      }
    `;
  }}

  &:active {
    transform: scale(0.95);
  }
`;

export const GenreTag: React.FC<GenreTagProps> = ({
  selected = false,
  children,
  onClick,
  className
}) => {
  return (
    <StyledGenreTag
      selected={selected}
      onClick={onClick}
      className={className}
    >
      {children}
    </StyledGenreTag>
  );
};

export default GenreTag;

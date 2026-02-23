import React from 'react';
import styled from 'styled-components';

export type MoodType = 'happy' | 'sad' | 'energetic' | 'calm' | 'romantic' | 'melancholy' | 'hopeful' | 'dark';

export interface MoodTagProps {
  mood: MoodType;
  emoji: string;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

const moodColors: Record<MoodType, { bg: string; border: string; shadow: string }> = {
  happy: { bg: 'rgba(255, 206, 86, 0.2)', border: '#FFCE56', shadow: 'rgba(255, 206, 86, 0.3)' },
  sad: { bg: 'rgba(54, 162, 235, 0.2)', border: '#36A2EB', shadow: 'rgba(54, 162, 235, 0.3)' },
  energetic: { bg: 'rgba(255, 99, 132, 0.2)', border: '#FF6384', shadow: 'rgba(255, 99, 132, 0.3)' },
  calm: { bg: 'rgba(75, 192, 192, 0.2)', border: '#4BC0C0', shadow: 'rgba(75, 192, 192, 0.3)' },
  romantic: { bg: 'rgba(255, 105, 180, 0.2)', border: '#FF69B4', shadow: 'rgba(255, 105, 180, 0.3)' },
  melancholy: { bg: 'rgba(153, 102, 255, 0.2)', border: '#9966FF', shadow: 'rgba(153, 102, 255, 0.3)' },
  hopeful: { bg: 'rgba(255, 159, 64, 0.2)', border: '#FF9F40', shadow: 'rgba(255, 159, 64, 0.3)' },
  dark: { bg: 'rgba(100, 100, 100, 0.2)', border: '#646464', shadow: 'rgba(100, 100, 100, 0.3)' }
};

const StyledMoodTag = styled.button<{ mood: MoodType; selected?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 20px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.05);
  color: #FFFFFF;

  ${props => {
    if (props.selected) {
      const colors = moodColors[props.mood];
      return `
        background: ${colors.bg};
        border-color: ${colors.border};
        box-shadow: 0 4px 12px ${colors.shadow};
      `;
    }
    return `
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

  .emoji {
    font-size: 18px;
    line-height: 1;
  }
`;

export const MoodTag: React.FC<MoodTagProps> = ({
  mood,
  emoji,
  label,
  selected = false,
  onClick,
  className
}) => {
  return (
    <StyledMoodTag
      mood={mood}
      selected={selected}
      onClick={onClick}
      className={className}
    >
      <span className="emoji">{emoji}</span>
      <span>{label}</span>
    </StyledMoodTag>
  );
};

export default MoodTag;

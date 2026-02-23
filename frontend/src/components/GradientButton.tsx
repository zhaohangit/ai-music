import React from 'react';
import styled, { css } from 'styled-components';

export interface GradientButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

const ButtonWrapper = styled.button<GradientButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 32px;
  border: none;
  border-radius: 16px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #FFFFFF;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.disabled ? 0.5 : 1};
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  ${props => {
    if (props.variant === 'secondary') {
      return css`
        background: linear-gradient(135deg, #F093FB 0%, #F5576C 100%);
        box-shadow: 0 8px 24px rgba(240, 147, 251, 0.3);

        &:hover:not(:disabled) {
          box-shadow: 0 12px 32px rgba(240, 147, 251, 0.4);
          transform: translateY(-2px);
        }
      `;
    }
    return css`
      background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);

      &:hover:not(:disabled) {
        box-shadow: 0 12px 32px rgba(102, 126, 234, 0.4);
        transform: translateY(-2px);
      }
    `;
  }}

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transition: left 0.5s ease;
  }

  &:hover:not(:disabled)::before {
    left: 100%;
  }
`;

export const GradientButton: React.FC<GradientButtonProps> = ({
  children,
  variant = 'primary',
  onClick,
  disabled = false,
  icon,
  className,
  type = 'button'
}) => {
  return (
    <ButtonWrapper
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      className={className}
      type={type}
    >
      {icon && <span className="button-icon">{icon}</span>}
      {children}
    </ButtonWrapper>
  );
};

export default GradientButton;

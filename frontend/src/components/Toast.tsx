import React, { useEffect, useState } from 'react';
import styled, { keyframes, css } from 'styled-components';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
  onClose?: (id: string) => void;
}

const slideIn = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
`;

const progress = keyframes`
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
`;

const ToastContainer = styled.div<{ $isExiting: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 320px;
  max-width: 420px;
  padding: 16px;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: ${props => props.$isExiting ? slideOut : slideIn} 0.3s ease-out forwards;
  position: relative;
  overflow: hidden;
`;

const ProgressBar = styled.div<{ $duration: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, #667EEA, #764BA2);
  animation: ${progress} ${props => props.$duration}ms linear forwards;
`;

const getIconColor = (type: ToastType): string => {
  switch (type) {
    case 'success':
      return '#10B981';
    case 'error':
      return '#EF4444';
    case 'warning':
      return '#F59E0B';
    case 'info':
    default:
      return '#667EEA';
  }
};

const getBorderColor = (type: ToastType): string => {
  switch (type) {
    case 'success':
      return 'rgba(16, 185, 129, 0.3)';
    case 'error':
      return 'rgba(239, 68, 68, 0.3)';
    case 'warning':
      return 'rgba(245, 158, 11, 0.3)';
    case 'info':
    default:
      return 'rgba(102, 126, 234, 0.3)';
  }
};

const ToastWithBorder = styled(ToastContainer)<{ $type: ToastType; $isExiting: boolean }>`
  border-left: 3px solid ${props => getBorderColor(props.$type)};
`;

const IconContainer = styled.div<{ $color: string }>`
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: ${props => props.$color};
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Title = styled.h4`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0;
`;

const Message = styled.p`
  font-size: 0.875rem;
  color: #8B8B9F;
  margin: 0;
  line-height: 1.4;
`;

const CloseButton = styled.button`
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8B8B9F;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #FFFFFF;
  }
`;

const getIcon = (type: ToastType): JSX.Element => {
  switch (type) {
    case 'success':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'error':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'warning':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
};

export const Toast: React.FC<ToastProps> = ({
  id,
  type = 'info',
  title,
  message,
  duration = 3000,
  onClose,
}) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = (): void => {
    if (!isExiting) {
      setIsExiting(true);
      setTimeout(() => {
        onClose?.(id);
      }, 300);
    }
  };

  return (
    <ToastWithBorder
      $type={type}
      $isExiting={isExiting}
    >
      <IconContainer $color={getIconColor(type)}>
        {getIcon(type)}
      </IconContainer>
      <Content>
        {title && <Title>{title}</Title>}
        <Message>{message}</Message>
      </Content>
      <CloseButton onClick={handleClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </CloseButton>
      <ProgressBar $duration={duration} />
    </ToastWithBorder>
  );
};

const ToastListContainer = styled.div`
  position: fixed;
  top: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 10000;
  pointer-events: none;

  @media (max-width: 640px) {
    top: 16px;
    right: 16px;
    left: 16px;
  }
`;

interface ToastListProps {
  toasts: ToastProps[];
  onClose: (id: string) => void;
}

export const ToastList: React.FC<ToastListProps> = ({ toasts, onClose }) => {
  return (
    <ToastListContainer>
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <Toast {...toast} onClose={onClose} />
        </div>
      ))}
    </ToastListContainer>
  );
};

export default Toast;

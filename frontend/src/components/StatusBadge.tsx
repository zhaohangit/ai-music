import React from 'react';
import styled, { keyframes } from 'styled-components';

export type StatusType = 'processing' | 'complete' | 'error';

export interface StatusBadgeProps {
  status: StatusType;
  text?: string;
  className?: string;
}

const pulseAnimation = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`;

const spinAnimation = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const BadgeWrapper = styled.div<{ status: StatusType }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;

  ${props => {
    switch (props.status) {
      case 'processing':
        return `
          background: rgba(255, 159, 64, 0.15);
          border: 1px solid rgba(255, 159, 64, 0.3);
          color: #FF9F40;
        `;
      case 'complete':
        return `
          background: rgba(75, 192, 192, 0.15);
          border: 1px solid rgba(75, 192, 192, 0.3);
          color: #4BC0C0;
        `;
      case 'error':
        return `
          background: rgba(255, 99, 132, 0.15);
          border: 1px solid rgba(255, 99, 132, 0.3);
          color: #FF6384;
        `;
      default:
        return '';
    }
  }}
`;

const StatusDot = styled.span<{ status: StatusType }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;

  ${props => {
    switch (props.status) {
      case 'processing':
        return `
          background: #FF9F40;
          animation: ${pulseAnimation} 1.5s ease-in-out infinite;
        `;
      case 'complete':
        return `
          background: #4BC0C0;
          box-shadow: 0 0 8px rgba(75, 192, 192, 0.5);
        `;
      case 'error':
        return `
          background: #FF6384;
          box-shadow: 0 0 8px rgba(255, 99, 132, 0.5);
        `;
      default:
        return '';
    }
  }}
`;

const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #FF9F40;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spinAnimation} 0.8s linear infinite;
`;

const statusText = {
  processing: 'Processing',
  complete: 'Complete',
  error: 'Error'
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  text,
  className
}) => {
  const displayText = text || statusText[status];

  return (
    <BadgeWrapper status={status} className={className}>
      {status === 'processing' ? (
        <Spinner />
      ) : (
        <StatusDot status={status} />
      )}
      <span>{displayText}</span>
    </BadgeWrapper>
  );
};

export default StatusBadge;

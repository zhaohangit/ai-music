import React, { Component, ErrorInfo, ReactNode } from 'react';
import styled from 'styled-components';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 40px;
  text-align: center;
`;

const ErrorIcon = styled.div`
  width: 80px;
  height: 80px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
`;

const ErrorTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 12px 0;
`;

const ErrorMessage = styled.p`
  font-size: 1rem;
  color: #8B8B9F;
  margin: 0 0 24px 0;
  max-width: 480px;
`;

const ErrorDetails = styled.details`
  margin: 24px 0;
  text-align: left;
  width: 100%;
  max-width: 600px;
`;

const ErrorSummary = styled.summary`
  cursor: pointer;
  color: #667EEA;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 12px;
  &:hover {
    color: #764BA2;
  }
`;

const ErrorStack = styled.pre`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
  font-size: 0.8125rem;
  color: #EF4444;
  overflow-x: auto;
  margin: 0;
`;

const RetryButton = styled.button`
  padding: 12px 24px;
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border: none;
  border-radius: 12px;
  color: #FFFFFF;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 30px rgba(102, 126, 234, 0.4);
  }

  &:active {
    transform: translateY(0);
  }
`;

const HomeButton = styled.button`
  margin-left: 12px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #FFFFFF;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  align-items: center;
`;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      errorInfo,
    });

    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <ErrorContainer>
          <ErrorIcon>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <circle cx="12" cy="16" r="1" fill="#EF4444" />
            </svg>
          </ErrorIcon>
          <ErrorTitle>Something went wrong</ErrorTitle>
          <ErrorMessage>
            An unexpected error occurred. Please try again or contact support if the problem persists.
          </ErrorMessage>
          <ButtonGroup>
            <RetryButton onClick={this.handleReset}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Try Again
            </RetryButton>
            <HomeButton onClick={this.handleGoHome}>
              Go Home
            </HomeButton>
          </ButtonGroup>
          {error && (
            <ErrorDetails>
              <ErrorSummary>Error details</ErrorSummary>
              <ErrorStack>{error.toString()}</ErrorStack>
              {errorInfo && (
                <ErrorStack style={{ marginTop: '12px' }}>
                  {errorInfo.componentStack}
                </ErrorStack>
              )}
            </ErrorDetails>
          )}
        </ErrorContainer>
      );
    }

    return children;
  }
}

export default ErrorBoundary;

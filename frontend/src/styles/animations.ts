import { keyframes, css } from 'styled-components';

// Keyframe animations
export const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

export const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

export const fadeInDown = keyframes`
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

export const fadeInLeft = keyframes`
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

export const fadeInRight = keyframes`
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

export const fadeInScale = keyframes`
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

export const slideInUp = keyframes`
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

export const slideInDown = keyframes`
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

export const slideInLeft = keyframes`
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

export const slideInRight = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

export const zoomIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

export const zoomOut = keyframes`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.5);
  }
`;

export const pulse = keyframes`
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(0.98);
  }
`;

export const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
`;

export const bounce = keyframes`
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-15px);
  }
  60% {
    transform: translateY(-7px);
  }
`;

export const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

export const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

export const glow = keyframes`
  0%, 100% {
    box-shadow: 0 0 5px rgba(102, 126, 234, 0.2);
  }
  50% {
    box-shadow: 0 0 20px rgba(102, 126, 234, 0.4);
  }
`;

export const float = keyframes`
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
`;

// Animation mixin utilities
export const animations = {
  fadeIn: css`
    animation: ${fadeIn} 0.3s ease-out forwards;
  `,
  fadeInUp: css`
    animation: ${fadeInUp} 0.4s ease-out forwards;
  `,
  fadeInDown: css`
    animation: ${fadeInDown} 0.4s ease-out forwards;
  `,
  fadeInLeft: css`
    animation: ${fadeInLeft} 0.4s ease-out forwards;
  `,
  fadeInRight: css`
    animation: ${fadeInRight} 0.4s ease-out forwards;
  `,
  fadeInScale: css`
    animation: ${fadeInScale} 0.3s ease-out forwards;
  `,
  slideInUp: css`
    animation: ${slideInUp} 0.4s ease-out forwards;
  `,
  slideInDown: css`
    animation: ${slideInDown} 0.4s ease-out forwards;
  `,
  slideInLeft: css`
    animation: ${slideInLeft} 0.4s ease-out forwards;
  `,
  slideInRight: css`
    animation: ${slideInRight} 0.4s ease-out forwards;
  `,
  zoomIn: css`
    animation: ${zoomIn} 0.3s ease-out forwards;
  `,
  zoomOut: css`
    animation: ${zoomOut} 0.3s ease-in forwards;
  `,
  pulse: css`
    animation: ${pulse} 2s ease-in-out infinite;
  `,
  shake: css`
    animation: ${shake} 0.5s ease-in-out;
  `,
  bounce: css`
    animation: ${bounce} 1s ease infinite;
  `,
  spin: css`
    animation: ${spin} 1s linear infinite;
  `,
  shimmer: css`
    animation: ${shimmer} 2s linear infinite;
  `,
  glow: css`
    animation: ${glow} 2s ease-in-out infinite;
  `,
  float: css`
    animation: ${float} 3s ease-in-out infinite;
  `,
};

// Stagger animation delay generator
export const getStaggerDelay = (index: number, baseDelay: number = 0.05): string => {
  return `${index * baseDelay}s`;
};

// Easing functions for custom animations
export const easings = {
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  smooth: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
};

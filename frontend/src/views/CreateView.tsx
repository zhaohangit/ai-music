import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled, { createGlobalStyle, keyframes } from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Wand2,
  Sliders,
  Play,
  Pause,
  Clock,
  Plus,
  MoreVertical,
  Download,
  Heart,
  Share2,
  AlertCircle,
  Loader2,
  Trash2,
  Link2,
  ExternalLink,
  Copy,
  ChevronLeft,
  ChevronRight,
  Music2,
  Zap,
  Star,
  Lightbulb
} from 'lucide-react';
import { fadeIn, fadeInUp, fadeInScale } from '../styles/animations';
import { musicApi, lyricsApi, MusicInfo } from '../services/api';
import { useAppStore } from '../hooks/useMusicStore';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useToast } from '../hooks/useToast';

// Global style for spin animation
const SpinAnimationStyle = createGlobalStyle`
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spin {
    animation: spin 1s linear infinite;
  }
`;

const CreateContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding-bottom: 20px;
`;

const TopSection = styled.div`
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 24px;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  z-index: 2;
`;

const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  z-index: 1;
`;

const GlassCard = styled.div`
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 28px;
  position: relative;
  z-index: 1;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  animation: ${fadeInUp} 0.5s ease-out;
`;

const CreateHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
`;

const CreateTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  background: linear-gradient(135deg, #FFFFFF, #E0E0FF);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
`;

const AIBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
  border: 1px solid rgba(102, 126, 234, 0.25);
  border-radius: 24px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #8B9EF5;
  box-shadow: 0 2px 12px rgba(102, 126, 234, 0.2);
`;

// Mode Toggle Styles
const ModeToggleContainer = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
`;

const ModeToggleBtn = styled.button<{ $active: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 20px;
  background: ${props => props.$active
    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.2))'
    : 'transparent'};
  border: ${props => props.$active
    ? '1px solid rgba(102, 126, 234, 0.4)'
    : '1px solid transparent'};
  border-radius: 10px;
  color: ${props => props.$active ? '#FFFFFF' : '#8B8B9F'};
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover:not(:disabled) {
    background: ${props => props.$active
      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(118, 75, 162, 0.25))'
      : 'rgba(255, 255, 255, 0.05)'};
    color: ${props => props.$active ? '#FFFFFF' : '#B0B0C0'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModeIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
`;

const ModeText = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
`;

const ModeTitle = styled.span`
  font-size: 0.95rem;
  font-weight: 600;
`;

const ModeDesc = styled.span`
  font-size: 0.7rem;
  opacity: 0.7;
`;

const SectionTitle = styled.h3`
  font-size: 0.8rem;
  font-weight: 600;
  color: #9B9BB0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 14px 0;
  display: flex;
  align-items: center;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 130px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px 18px;
  color: #FFFFFF;
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
  transition: all 0.25s ease;

  &::placeholder {
    color: #6B6B80;
  }

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    background: rgba(255, 255, 255, 0.05);
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const LyricsDisplay = styled.div`
  width: 100%;
  max-height: 280px;
  overflow-y: auto;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08));
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 14px;
  padding: 18px;
  color: #FFFFFF;
  font-size: 0.9rem;
  line-height: 1.9;
  white-space: pre-wrap;
  font-family: inherit;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.3);
    border-radius: 3px;

    &:hover {
      background: rgba(102, 126, 234, 0.5);
    }
  }
`;

const LyricsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const CopyButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #9B9BB0;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #FFFFFF;
    border-color: rgba(255, 255, 255, 0.15);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PromptEnhanceButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.1));
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 10px;
  color: #8B9EF5;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 10px;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.2));
    border-color: rgba(102, 126, 234, 0.5);
    color: #A0B0F5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LyricsActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StyleRecommendButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.1));
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  color: #8B9EF5;
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.2));
    border-color: rgba(102, 126, 234, 0.5);
    color: #A0B0F5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SelectorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
`;

const SelectorOption = styled.button<{ $selected?: boolean }>`
  padding: 12px 16px;
  background: ${props => props.$selected
    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.2))'
    : 'rgba(255, 255, 255, 0.04)'};
  border: ${props => props.$selected
    ? '1px solid rgba(102, 126, 234, 0.4)'
    : '1px solid rgba(255, 255, 255, 0.08)'};
  border-radius: 12px;
  color: ${props => props.$selected ? '#8B9EF5' : '#9B9BB0'};
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: ${props => props.$selected
      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.35), rgba(118, 75, 162, 0.3))'
      : 'rgba(255, 255, 255, 0.08)'};
    border-color: ${props => props.$selected
      ? 'rgba(102, 126, 234, 0.5)'
      : 'rgba(255, 255, 255, 0.15)'};
    color: ${props => props.$selected ? '#A0B0F5' : '#FFFFFF'};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }
`;

const AdvancedSettings = styled.div<{ $open: boolean }>`
  max-height: ${props => props.$open ? '600px' : '0'};
  overflow: hidden;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  padding: 18px 0;
`;

const SettingItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const SettingLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: #9B9BB0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

// Advanced Settings Styles
const AdvancedSection = styled.div`
  padding: 18px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 10px;
`;

const AdvancedSectionTitle = styled.h4`
  font-size: 0.85rem;
  font-weight: 600;
  color: #9B9BB0;
  margin: 0 0 14px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SliderContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const SliderValue = styled.span`
  font-size: 0.8rem;
  color: #667EEA;
  font-weight: 600;
`;

const StyledSlider = styled.input`
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667EEA, #764BA2);
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
    transition: transform 0.15s ease;
  }

  &::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667EEA, #764BA2);
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
  }
`;

const TagInput = styled.input`
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #FFFFFF;
  font-size: 0.9rem;
  transition: all 0.2s ease;

  &::placeholder {
    color: #6B6B80;
  }

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const ModelVersionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
`;

const ModelVersionOption = styled.button<{ $selected?: boolean }>`
  padding: 10px 12px;
  background: ${props => props.$selected
    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.2))'
    : 'rgba(255, 255, 255, 0.04)'};
  border: ${props => props.$selected
    ? '1px solid rgba(102, 126, 234, 0.4)'
    : '1px solid rgba(255, 255, 255, 0.08)'};
  border-radius: 10px;
  color: ${props => props.$selected ? '#8B9EF5' : '#9B9BB0'};
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$selected
      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.35), rgba(118, 75, 162, 0.3))'
      : 'rgba(255, 255, 255, 0.08)'};
  }
`;

const SelectInput = styled.select`
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #FFFFFF;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  option {
    background: #1A1A2E;
    color: #FFFFFF;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 14px;
  margin-top: 28px;
  position: relative;
  z-index: 10;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'ghost' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 28px;
  border-radius: 14px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  flex: 1;
  position: relative;
  z-index: 1;
  pointer-events: auto;

  ${props => props.$variant === 'primary' && `
    background: linear-gradient(135deg, #667EEA, #764BA2);
    color: #FFFFFF;
    border: none;
    box-shadow:
      0 4px 20px rgba(102, 126, 234, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);

    &:hover {
      transform: translateY(-2px);
      box-shadow:
        0 8px 30px rgba(102, 126, 234, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    &:active {
      transform: translateY(0);
    }
  `}

  ${props => props.$variant === 'secondary' && `
    background: rgba(255, 255, 255, 0.05);
    color: #FFFFFF;
    border: 1px solid rgba(255, 255, 255, 0.12);

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }
  `}

  ${props => props.$variant === 'ghost' && `
    background: transparent;
    color: #9B9BB0;
    border: none;
    flex: 0 0 auto;
    padding: 12px 16px;

    &:hover {
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.05);
    }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }
`;

const PlayerCard = styled(GlassCard)`
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
`;

const PlayerCover = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.08), transparent 50%);
  }
`;

const PlayButtonOverlay = styled.button`
  width: 72px;
  height: 72px;
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow:
    0 6px 24px rgba(102, 126, 234, 0.4),
    inset 0 2px 0 rgba(255, 255, 255, 0.15);
  position: relative;
  z-index: 2;

  &:hover {
    transform: scale(1.08);
    box-shadow:
      0 8px 32px rgba(102, 126, 234, 0.5),
      inset 0 2px 0 rgba(255, 255, 255, 0.2);
  }

  &:active {
    transform: scale(1.02);
  }
`;

const PlayerInfo = styled.div`
  text-align: center;
`;

const PlayerTitle = styled.h4`
  font-size: 1.05rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 6px 0;
`;

const PlayerMeta = styled.p`
  font-size: 0.875rem;
  color: #9B9BB0;
  margin: 0;
`;

const progressShimmer = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

const PlayerProgress = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
  position: relative;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
`;

const PlayerProgressBar = styled.div<{ $progress: number; $hasTrack?: boolean }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: ${props => props.$hasTrack === false
    ? 'rgba(255, 255, 255, 0.1)'
    : 'linear-gradient(90deg, #667EEA, #764BA2)'};
  border-radius: 3px;
  transition: width 0.1s ease;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    background: #FFFFFF;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transition: opacity 0.2s;
  }

  ${PlayerProgress}:hover &::after {
    opacity: 1;
  }
`;

const PlayerProgressPlaceholder = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg,
    rgba(102, 126, 234, 0.1) 0%,
    rgba(102, 126, 234, 0.3) 50%,
    rgba(102, 126, 234, 0.1) 100%
  );
  animation: ${progressShimmer} 2s ease-in-out infinite;
  border-radius: 3px;
`;

const PlayerTime = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #9B9BB0;
  margin-top: 6px;
`;

// Local animations (shimmer, wave for visual effects)
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const wave = keyframes`
  0%, 100% { transform: scaleY(0.5); }
  50% { transform: scaleY(1); }
`;

const RecentSection = styled(GlassCard)`
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 24px 28px;
  animation: ${fadeInUp} 0.6s ease-out;
  animation-delay: 0.1s;
`;

const RecentHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const RecentTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  background: linear-gradient(135deg, #FFFFFF, #E0E0FF);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ViewAllButton = styled.button`
  color: #667EEA;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 10px;
  padding: 8px 16px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    color: #8B9EF5;
    background: rgba(102, 126, 234, 0.15);
    border-color: rgba(102, 126, 234, 0.3);
  }
`;

const RecentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
`;

const RecentCard = styled.div.attrs({ className: 'recent-card' })<{ $isActive?: boolean; $menuOpen?: boolean }>`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: ${props => props.$isActive
    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.1))'
    : 'rgba(255, 255, 255, 0.03)'};
  border: 1px solid ${props => props.$isActive
    ? 'rgba(102, 126, 234, 0.3)'
    : 'rgba(255, 255, 255, 0.06)'};
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: ${props => props.$isActive
      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.15))'
      : 'rgba(255, 255, 255, 0.06)'};
    border-color: rgba(102, 126, 234, 0.25);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
  }

  ${props => props.$menuOpen && `
    & .recent-actions {
      opacity: 1;
    }
  `}
`;

const RecentCover = styled.div<{ $isPlaying?: boolean }>`
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.2));
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(45deg, transparent 40%, rgba(255, 255, 255, 0.15) 50%, transparent 60%);
    background-size: 200% 200%;
    animation: ${shimmer} 3s infinite;
    opacity: ${props => props.$isPlaying ? 1 : 0};
    transition: opacity 0.3s;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 12px;
  }
`;

const PlayingIndicator = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  height: 20px;
`;

const SoundBar = styled.div`
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #667EEA, #764BA2);
  border-radius: 2px;
  animation: ${wave} 0.8s ease-in-out infinite;

  &:nth-child(1) { animation-delay: 0s; }
  &:nth-child(2) { animation-delay: 0.2s; }
  &:nth-child(3) { animation-delay: 0.4s; }
`;

const RecentInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const RecentItemTitle = styled.span`
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
`;

const RecentMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const RecentTag = styled.span<{ $processing?: boolean; $error?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: ${props => props.$processing
    ? 'rgba(245, 158, 11, 0.15)'
    : props.$error
    ? 'rgba(245, 87, 108, 0.15)'
    : 'rgba(102, 126, 234, 0.15)'};
  border-radius: 12px;
  font-size: 0.75rem;
  color: ${props => props.$processing
    ? '#F59E0B'
    : props.$error
    ? '#F5576C'
    : '#8B9EF5'};
  font-weight: 600;
`;

// 状态徽章
const StatusBadge = styled.div<{ $status: 'processing' | 'error' }>`
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 0.65rem;
  font-weight: 600;
  background: ${props => props.$status === 'processing'
    ? 'rgba(245, 158, 11, 0.8)'
    : 'rgba(245, 87, 108, 0.8)'};
  color: white;
  backdrop-filter: blur(4px);
`;

const RecentTime = styled.span`
  font-size: 0.75rem;
  color: #8B8B9F;
`;

// Pagination
const PaginationContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

const PaginationButton = styled.button<{ $disabled?: boolean }>`
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$disabled ? 'transparent' : 'linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.1))'};
  border: 1px solid ${props => props.$disabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(102, 126, 234, 0.25)'};
  border-radius: 12px;
  color: ${props => props.$disabled ? 'rgba(255, 255, 255, 0.3)' : '#8B9EF5'};
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.2));
    border-color: rgba(102, 126, 234, 0.4);
    color: #A0B0F5;
    transform: translateY(-1px);
  }
`;

const PageIndicator = styled.span`
  font-size: 0.9rem;
  color: #FFFFFF;
  font-weight: 600;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 16px;
  border-radius: 10px;
`;

const LoadingMore = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: #8B8B9F;
  font-size: 0.95rem;
`;

const RecentActions = styled.div.attrs({ className: 'recent-actions' })`
  display: flex;
  gap: 8px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s ease;

  .recent-card:hover & {
    opacity: 1;
  }
`;

const IconButton = styled.button`
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9B9BB0;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #FFFFFF;
    transform: scale(1.05);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const MoreMenuWrapper = styled.div`
  position: relative;
`;

const MoreMenu = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: rgba(25, 25, 45, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 8px;
  min-width: 180px;
  z-index: 100;
  opacity: ${props => props.$isOpen ? 1 : 0};
  visibility: ${props => props.$isOpen ? 'visible' : 'hidden'};
  transform: ${props => props.$isOpen ? 'translateY(0)' : 'translateY(-8px)'};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
`;

const MoreMenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  background: transparent;
  border: none;
  border-radius: 10px;
  color: ${props => props.$danger ? '#F87171' : '#FFFFFF'};
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;

  &:hover {
    background: ${props => props.$danger ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.08)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const MenuDivider = styled.div`
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 0;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #8B8B9F;
  text-align: center;
`;

const EmptyIcon = styled.div`
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.1));
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
`;

const EmptyText = styled.p`
  font-size: 1rem;
  color: #8B8B9F;
  margin: 0 0 8px 0;
`;

const EmptySubtext = styled.p`
  font-size: 0.875rem;
  color: #6B6B80;
  margin: 0;
`;

const LoadingOverlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 15, 35, 0.92);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  border-radius: 18px;
  opacity: ${props => props.$visible ? 1 : 0};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transition: all 0.3s ease;
`;

const ProgressBar = styled.div`
  width: 180px;
  height: 5px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: linear-gradient(90deg, #667EEA, #764BA2);
  border-radius: 3px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(102, 126, 234, 0.5);
`;

const ErrorBanner = styled.div<{ $visible: boolean }>`
  display: ${props => props.$visible ? 'flex' : 'none'};
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05));
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 14px;
  margin-bottom: 18px;
`;

const ErrorIcon = styled(AlertCircle)`
  color: #F87171;
  flex-shrink: 0;
`;

const ErrorText = styled.p`
  flex: 1;
  font-size: 0.9rem;
  color: #FCA5A5;
  margin: 0;
`;

const DismissButton = styled.button`
  background: rgba(255, 255, 255, 0.05);
  border: none;
  color: #9B9BB0;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    color: #FFFFFF;
    background: rgba(255, 255, 255, 0.1);
  }
`;

export const CreateView: React.FC = () => {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();

  // Store state
  const {
    musicGeneration,
    lyricsGeneration,
    startMusicGeneration,
    updateMusicGenerationProgress,
    completeMusicGeneration,
    failMusicGeneration,
    resetMusicGeneration,
    startLyricsGeneration,
    completeLyricsGeneration,
    failLyricsGeneration,
    resetLyricsGeneration,
    recentTracks,
    currentTrack,
    isPlaying,
    setCurrentTrack,
    setIsPlaying,
    addToRecentTracks,
    currentTime,
    duration: playbackDuration,
    seek,
  } = useAppStore();

  // Local state
  const [mode, setMode] = useState<'inspiration' | 'custom'>('inspiration');
  const [description, setDescription] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('Pop');
  const [selectedMood, setSelectedMood] = useState('Energetic');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Note: duration and bpm are NOT supported by Suno API - removed
  const [vocals, setVocals] = useState<'None' | 'Female' | 'Male'>('Female');
  const [lyrics, setLyrics] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Advanced settings - according to API spec
  const [negativeTags, setNegativeTags] = useState('');
  const [vocalGender, setVocalGender] = useState<'m' | 'f' | ''>(''); // API: m=male, f=female
  const [modelVersion, setModelVersion] = useState<'chirp-v3-0' | 'chirp-v3-5' | 'chirp-v4' | 'chirp-auk-turbo' | 'chirp-auk' | 'chirp-bluejay' | 'chirp-crow'>('chirp-v3-5');
  const [styleWeight, setStyleWeight] = useState(0.5); // API: 0-1 float
  const [weirdnessConstraint, setWeirdnessConstraint] = useState(0.5); // API: 0-1 float

  // AI Enhancement loading states
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [polishingLyrics, setPolishingLyrics] = useState(false);
  const [recommendingStyle, setRecommendingStyle] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [apiTracks, setApiTracks] = useState<MusicInfo[]>([]);
  const pageSize = 6;

  // Fetch recent tracks from API with pagination
  const fetchRecentTracks = useCallback(async (page: number) => {
    try {
      setIsLoadingMore(true);
      const response = await musicApi.getList(page, pageSize);
      if (response.success && response.data) {
        let items: MusicInfo[] = [];
        let total = 0;

        // Handle different response formats
        if (Array.isArray(response.data)) {
          items = response.data;
          total = response.data.length;
        } else if (response.data.items) {
          items = response.data.items;
          total = response.data.total || items.length;
        } else if (response.data.tracks) {
          items = response.data.tracks;
          total = response.data.total || items.length;
        }

        // 显示所有状态的歌曲（包括处理中、完成、失败的）
        setApiTracks(items);
        setTotalCount(total);
        setTotalPages(Math.ceil(total / pageSize));

        // Also add to store for backward compatibility
        items.forEach((track: MusicInfo) => {
          if (!recentTracks.find(t => t.id === track.id)) {
            addToRecentTracks(track);
          }
        });
      }
    } catch (error) {
      console.error('Failed to fetch recent tracks:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [addToRecentTracks, recentTracks]);

  // Fetch on mount and page change
  useEffect(() => {
    fetchRecentTracks(currentPage);
  }, [currentPage]);

  // Pagination handlers
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  // Combine API tracks with store tracks (API tracks take priority for display)
  // Deduplicate by id to prevent duplicate tracks from showing
  const displayTracks = (() => {
    const tracks = apiTracks.length > 0 ? apiTracks : recentTracks.slice(0, pageSize);
    const seenIds = new Set<string>();
    return tracks.filter(track => {
      if (seenIds.has(track.id)) {
        return false;
      }
      seenIds.add(track.id);
      return true;
    });
  })();

  // Helper function to format date with time (i18n aware)
  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Get current locale from i18n
    const locale = (window as any).localStorage?.getItem('i18nextLng') || 'en';
    const isChinese = locale.startsWith('zh');

    const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', ...timeOptions };

    if (diffMins < 1) {
      return t('time.justNow');
    } else if (diffMins < 60) {
      return t('time.minsAgo', { count: diffMins });
    } else if (diffHours < 24) {
      const timeStr = date.toLocaleTimeString(isChinese ? 'zh-CN' : 'en-US', timeOptions);
      return `${t('time.today')} ${timeStr}`;
    } else if (diffDays === 1) {
      const timeStr = date.toLocaleTimeString(isChinese ? 'zh-CN' : 'en-US', timeOptions);
      return `${t('time.yesterday')} ${timeStr}`;
    } else if (diffDays < 7) {
      const dayName = date.toLocaleDateString(isChinese ? 'zh-CN' : 'en-US', { weekday: 'short' });
      const timeStr = date.toLocaleTimeString(isChinese ? 'zh-CN' : 'en-US', timeOptions);
      return `${dayName} ${timeStr}`;
    } else {
      return date.toLocaleDateString(isChinese ? 'zh-CN' : 'en-US', dateOptions);
    }
  };

  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const genres = ['Electronic', 'Pop', 'Hip-Hop', 'Rock', 'Jazz', 'Classical'];
  const moods = ['Energetic', 'Romantic', 'Relaxing', 'Dreamy', 'Intense'];

  // Poll music generation status
  const pollMusicStatus = useCallback(async (taskId: string) => {
    try {
      const response = await musicApi.getStatus(taskId);

      if (response.data?.status === 'complete' && response.data) {
        completeMusicGeneration(response.data);
        showSuccess(t('common.musicGenerated'), t('common.success'));
        return true;
      } else if (response.data?.status === 'error') {
        const err =
          response.data.errorMessage ||
          response.data.errorMessageEn ||
          t('common.musicFailed');
        failMusicGeneration(err);
        showError(err, t('common.error'));
        return true;
      } else if (response.data) {
        // Update progress if available
        const responseData = response.data as MusicInfo & { progress?: number };
        const progress = responseData.progress ||
          (musicGeneration.progress || 0) + 10;
        updateMusicGenerationProgress(Math.min(progress, 90));
      }
      return false;
    } catch (error) {
      if (error instanceof Error) {
        failMusicGeneration(error.message);
        showError(error.message, t('common.statusCheckFailed'));
      } else {
        failMusicGeneration(t('common.statusCheckFailed'));
        showError(t('common.statusCheckFailed'), t('common.error'));
      }
      return true;
    }
  }, [completeMusicGeneration, failMusicGeneration, updateMusicGenerationProgress, musicGeneration.progress, showSuccess, showError, t]);

  // Start polling for music generation
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    if (musicGeneration.status === 'generating' && musicGeneration.taskId) {
      pollInterval = setInterval(async () => {
        const isComplete = await pollMusicStatus(musicGeneration.taskId!);
        if (isComplete && pollInterval) {
          clearInterval(pollInterval);
        }
      }, 2000); // Poll every 2 seconds
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [musicGeneration.status, musicGeneration.taskId, pollMusicStatus]);

  // Handle Enhance Prompt
  const handleEnhancePrompt = async () => {
    if (!description.trim()) {
      showError(t('create.promptPlaceholder'), t('common.error'));
      return;
    }

    try {
      setEnhancingPrompt(true);
      showInfo(t('create.enhancingPrompt', '正在增强提示词...'), t('create.enhancePrompt', '增强提示词'));

      const response = await lyricsApi.enhance(description);

      if (response.data?.enhancedPrompt) {
        setDescription(response.data.enhancedPrompt);
        showSuccess(t('common.success'), t('create.promptEnhanced', '提示词已增强'));
      } else {
        throw new Error('No enhanced prompt returned');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.error');
      showError(errorMessage, t('create.enhanceFailed', '增强失败'));
    } finally {
      setEnhancingPrompt(false);
    }
  };

  // Handle Polish Lyrics
  const handlePolishLyrics = async () => {
    if (!lyrics.trim()) {
      showError(t('create.noLyrics', '请先生成歌词'), t('common.error'));
      return;
    }

    try {
      setPolishingLyrics(true);
      showInfo(t('create.polishingLyrics', '正在润色歌词...'), t('create.polishLyrics', '润色歌词'));

      const response = await lyricsApi.polish(lyrics, selectedGenre);

      if (response.data?.polishedLyrics) {
        setLyrics(response.data.polishedLyrics);
        showSuccess(t('common.success'), t('create.lyricsPolished', '歌词已润色'));
      } else {
        throw new Error('No polished lyrics returned');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.error');
      showError(errorMessage, t('create.polishFailed', '润色失败'));
    } finally {
      setPolishingLyrics(false);
    }
  };

  // Handle Recommend Style
  const handleRecommendStyle = async () => {
    if (!description.trim()) {
      showError(t('create.promptPlaceholder'), t('common.error'));
      return;
    }

    try {
      setRecommendingStyle(true);
      showInfo(t('create.recommendingStyle', '正在推荐风格...'), t('create.recommendStyle', '风格推荐'));

      const response = await lyricsApi.recommendStyle(description);

      if (response.data) {
        const { tags, mood, tempo } = response.data;
        // Apply recommended settings
        if (tags && tags.length > 0) {
          const matchedGenre = genres.find(g =>
            tags.some(tag => g.toLowerCase().includes(tag.toLowerCase()))
          );
          if (matchedGenre) setSelectedGenre(matchedGenre);
        }
        if (mood) {
          const matchedMood = moods.find(m =>
            m.toLowerCase().includes(mood.toLowerCase()) ||
            mood.toLowerCase().includes(m.toLowerCase())
          );
          if (matchedMood) setSelectedMood(matchedMood);
        }
        // Note: tempo/BPM is not supported by API, so we don't set it
        showSuccess(t('common.success'), t('create.styleRecommended', '风格已推荐'));
      } else {
        throw new Error('No style recommendation returned');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.error');
      showError(errorMessage, t('create.recommendFailed', '推荐失败'));
    } finally {
      setRecommendingStyle(false);
    }
  };

  // Handle AI Lyrics generation
  const handleGenerateLyrics = async () => {
    if (!description.trim()) {
      setErrorVisible(true);
      showError(t('create.promptPlaceholder'), t('common.error'));
      return;
    }

    try {
      startLyricsGeneration();
      setErrorVisible(false);
      showInfo(t('common.loading'), t('create.aiLyrics'));

      const response = await lyricsApi.generate({
        idea: description,
        style: selectedGenre,
        mood: selectedMood,
      });

      if (response.data) {
        setLyrics(response.data.lyrics);
        // Don't replace description - keep the original prompt
        // setDescription(response.data.lyrics);
        completeLyricsGeneration(response.data);
        showSuccess(t('common.success'), t('common.lyricsGenerated'));
      } else {
        throw new Error('No lyrics generated');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.error');
      failLyricsGeneration(errorMessage);
      setErrorVisible(true);
      showError(errorMessage, t('common.error'));
    }
  };

  // Handle Music generation
  const handleGenerateMusic = async () => {
    if (!description.trim()) {
      setErrorVisible(true);
      showError(t('create.promptPlaceholder'), t('common.error'));
      return;
    }

    try {
      setErrorVisible(false);
      showInfo(t('create.generating'), t('create.generateBtn'));

      // Build API params based on backend expectations
      // Backend expects: mode, prompt, title, lyrics, tags, mood, llmProvider, mv, instrumental
      const apiParams: any = {
        mode: mode, // 'inspiration' or 'custom'
        prompt: description, // Backend uses 'prompt' for both modes
        title: `${selectedMood} ${selectedGenre}`,
        tags: selectedGenre,
        mood: selectedMood,
        instrumental: vocals === 'None', // Backend uses 'instrumental', not 'make_instrumental'
      };

      // Add model version if specified (backend validates: 'chirp-v3-5', 'chirp-v4', 'v3.5')
      if (modelVersion) {
        apiParams.mv = modelVersion;
      }

      // Custom mode specific parameters
      if (mode === 'custom' && lyrics) {
        apiParams.lyrics = lyrics;
      }

      // Call the API to create music
      const response = await musicApi.create(apiParams);

      if (response.data?.taskId || response.data?.task_id || response.data?.id) {
        const taskId = response.data.taskId || response.data.task_id || response.data.id;
        startMusicGeneration(taskId);
        showSuccess(t('common.success'), t('create.generateBtn'));
      } else {
        throw new Error('No task ID returned from server');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.error');
      failMusicGeneration(errorMessage);
      setErrorVisible(true);
      showError(errorMessage, t('common.error'));
    }
  };

  // Handle error dismissal
  const handleDismissError = () => {
    setErrorVisible(false);
    resetMusicGeneration();
    resetLyricsGeneration();
  };

  const isGenerating = musicGeneration.status === 'generating' || lyricsGeneration.status === 'generating';
  const currentError = musicGeneration.error || lyricsGeneration.error;

  // Play track from recent tracks
  const handlePlayTrack = useCallback(async (track: typeof recentTracks[0]) => {
    // 根据状态显示不同提示
    if (track.status === 'processing') {
      showInfo(t('common.trackProcessing', '歌曲正在生成中，请稍后再试...'), t('common.processing'));
      // 尝试从服务器获取最新状态
      try {
        const response = await musicApi.getStatus(track.id);
        if (response.data?.status === 'complete' && response.data.audioUrl) {
          // 更新本地数据
          setApiTracks(prev => prev.map(t =>
            t.id === track.id ? { ...t, ...response.data } : t
          ));
          showSuccess(t('common.trackReady', '歌曲已生成完成！'), t('common.success'));
        }
      } catch (err) {
        console.warn('Failed to check track status:', err);
      }
      return;
    }

    if (track.status === 'error') {
      const errorMsg = track.errorMessage || track.errorMessageEn || t('common.trackFailed', '歌曲生成失败');
      showError(errorMsg, t('common.error'));
      return;
    }

    if (!track.audioUrl) {
      // 没有 audioUrl 但状态不是 processing/error，尝试查询最新状态
      try {
        const response = await musicApi.getStatus(track.id);
        if (response.data?.audioUrl) {
          // 更新本地数据并播放
          const updatedTrack = { ...track, ...response.data };
          setApiTracks(prev => prev.map(t =>
            t.id === track.id ? updatedTrack : t
          ));
          setCurrentTrack(updatedTrack);
          setIsPlaying(true);
          return;
        }
      } catch (err) {
        console.warn('Failed to fetch track:', err);
      }
      showError(t('common.trackNotReady'), t('common.trackNotAvailable'));
      return;
    }

    if (currentTrack?.id === track.id && isPlaying) {
      setIsPlaying(false);
    } else {
      setCurrentTrack(track);
      setIsPlaying(true);
    }
  }, [currentTrack, isPlaying, setCurrentTrack, setIsPlaying, showError, showInfo, showSuccess, t, setApiTracks]);

  // Download track
  const handleDownloadTrack = useCallback(async (track: typeof recentTracks[0]) => {
    if (!track.audioUrl) {
      showError(t('common.trackNotReady'), t('common.trackNotAvailable'));
      return;
    }

    try {
      const filename = `${track.title || 'track'}.mp3`;
      await musicApi.download(track.id, filename);
      showSuccess(t('common.downloadStarted'), t('common.download'));
      setOpenMenuId(null);
    } catch (err) {
      console.error('Failed to download track:', err);
      showError(t('common.downloadFailed'), t('common.error'));
    }
  }, [showSuccess, showError, t]);

  // Share track
  const handleShareTrack = useCallback(async (track: typeof recentTracks[0]) => {
    const shareUrl = `${window.location.origin}/track/${track.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showSuccess(t('common.linkCopied'), t('common.share'));
    } catch (err) {
      console.error('Failed to copy link:', err);
      showError(t('common.copyFailed'), t('common.error'));
    }
    setOpenMenuId(null);
  }, [showSuccess, showError, t]);

  // Copy audio URL
  const handleCopyAudioUrl = useCallback(async (track: typeof recentTracks[0]) => {
    if (!track.audioUrl) {
      showError(t('common.trackNotReady'), t('common.trackNotAvailable'));
      return;
    }
    try {
      await navigator.clipboard.writeText(track.audioUrl);
      showSuccess(t('common.audioUrlCopied'), t('common.success'));
    } catch (err) {
      console.error('Failed to copy URL:', err);
      showError(t('common.copyFailed'), t('common.error'));
    }
    setOpenMenuId(null);
  }, [showSuccess, showError, t]);

  // Toggle favorite status
  const handleToggleFavorite = useCallback(async (e: React.MouseEvent, track: typeof recentTracks[0]) => {
    e.stopPropagation();

    // Optimistic update - update UI immediately
    const wasFavorited = favorites.has(track.id);
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (wasFavorited) {
        newFavorites.delete(track.id);
      } else {
        newFavorites.add(track.id);
      }
      return newFavorites;
    });

    // Show immediate feedback
    showSuccess(wasFavorited ? t('common.removedFromFavorites') : t('common.addedToFavorites'), t('common.success'));

    // Try to sync with backend (silently fail if not available)
    try {
      await musicApi.toggleFavorite(track.id);
    } catch (err) {
      console.warn('Favorite sync failed (local state preserved):', err);
      // Don't revert or show error - local state is what matters for UI
    }
  }, [favorites, showSuccess, t]);

  // Delete track
  const handleDeleteTrack = useCallback(async (track: typeof recentTracks[0]) => {
    if (!confirm(t('common.confirmDelete'))) {
      return;
    }
    try {
      await musicApi.delete(track.id);
      // Update local state to remove the deleted track
      setApiTracks(prev => prev.filter(t => t.id !== track.id));
      showSuccess(t('common.trackDeleted'), t('common.success'));
      setOpenMenuId(null);
      // Refresh the list from API
      fetchRecentTracks(currentPage);
    } catch (err) {
      console.error('Failed to delete track:', err);
      showError(t('common.deleteFailed'), t('common.error'));
    }
  }, [showSuccess, showError, t, fetchRecentTracks, currentPage]);

  // Get currently displayed track (either generated result or selected from recent)
  const displayTrack = musicGeneration.result || currentTrack;

  // Format time helper
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progressPercent = playbackDuration > 0 ? (currentTime / playbackDuration) * 100 : 0;

  // Handle progress bar click/seek
  const handleProgressSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * playbackDuration;
    seek(newTime);
  };

  return (
    <>
      <SpinAnimationStyle />
      <CreateContainer>
        {/* Top Section: Creation Form + Player */}
        <TopSection>
          <LeftPanel>
            <GlassCard>
              <CreateHeader>
                <CreateTitle>{t('create.title')}</CreateTitle>
                <AIBadge>
                  <Sparkles size={14} />
                  {t('create.aiPowered')}
                </AIBadge>
              </CreateHeader>

              {/* Mode Toggle */}
              <ModeToggleContainer>
                <ModeToggleBtn
                  $active={mode === 'inspiration'}
                  onClick={() => setMode('inspiration')}
                >
                  <ModeIcon>
                    <Lightbulb size={18} />
                  </ModeIcon>
                  <ModeText>
                    <ModeTitle>{t('create.inspirationMode', '灵感模式')}</ModeTitle>
                    <ModeDesc>{t('create.inspirationModeDesc', '简单描述，AI帮你完成')}</ModeDesc>
                  </ModeText>
                </ModeToggleBtn>
                <ModeToggleBtn
                  $active={mode === 'custom'}
                  onClick={() => setMode('custom')}
                >
                  <ModeIcon>
                    <Sliders size={18} />
                  </ModeIcon>
                  <ModeText>
                    <ModeTitle>{t('create.customMode', '自定义模式')}</ModeTitle>
                    <ModeDesc>{t('create.customModeDesc', '详细控制歌词和风格')}</ModeDesc>
                  </ModeText>
                </ModeToggleBtn>
              </ModeToggleContainer>

              <SectionTitle>{mode === 'inspiration' ? t('create.ideaLabel', '音乐创意') : t('create.promptLabel')}</SectionTitle>
              <TextArea
                placeholder={mode === 'inspiration'
                  ? t('create.inspirationPlaceholder', '描述你想要的音乐，例如：一首关于夏天海边的轻快流行歌曲...')
                  : t('create.promptPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <PromptEnhanceButton
                onClick={handleEnhancePrompt}
                disabled={enhancingPrompt || !description.trim()}
              >
                {enhancingPrompt ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    {t('create.enhancing', '增强中...')}
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    {t('create.enhancePrompt', 'AI增强提示词')}
                  </>
                )}
              </PromptEnhanceButton>

              {/* Custom Mode: Lyrics Section */}
              {mode === 'custom' && (
                <>
                  {/* Lyrics Textarea for custom mode */}
                  <SectionTitle style={{ marginTop: '16px' }}>{t('create.lyricsLabel', '歌词 (可选)')}</SectionTitle>
                  <TextArea
                    placeholder={t('create.lyricsPlaceholder', '输入歌词或点击AI生成歌词...')}
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    style={{ minHeight: '100px' }}
                  />
                </>
              )}

              {/* Generated Lyrics Display */}
              {lyrics && (
                <>
                  <LyricsHeader>
                    <SectionTitle style={{ margin: 0 }}>{t('create.aiLyrics')}</SectionTitle>
                    <LyricsActions>
                      <CopyButton onClick={() => {
                        navigator.clipboard.writeText(lyrics);
                        showSuccess(t('common.success'), t('common.copied'));
                      }}>
                        <Copy size={14} />
                        {t('common.copy')}
                      </CopyButton>
                      <CopyButton
                        onClick={handlePolishLyrics}
                        disabled={polishingLyrics}
                      >
                        {polishingLyrics ? (
                          <>
                            <Loader2 size={14} className="spin" />
                            {t('create.polishing', '润色中...')}
                          </>
                        ) : (
                          <>
                            <Star size={14} />
                            {t('create.polishLyrics', '润色歌词')}
                          </>
                        )}
                      </CopyButton>
                    </LyricsActions>
                  </LyricsHeader>
                  <LyricsDisplay>{lyrics}</LyricsDisplay>
                </>
              )}

              {/* Custom Mode: Genre and Mood Selectors */}
              {mode === 'custom' && (
                <>
                  <SectionTitle>
                    {t('genre.title')}
                    <StyleRecommendButton
                      onClick={handleRecommendStyle}
                      disabled={recommendingStyle || !description.trim()}
                    >
                      {recommendingStyle ? (
                        <>
                          <Loader2 size={12} className="spin" />
                          {t('create.recommending', '推荐中...')}
                        </>
                      ) : (
                        <>
                          <Lightbulb size={12} />
                          {t('create.recommendStyle', 'AI推荐')}
                        </>
                      )}
                    </StyleRecommendButton>
                  </SectionTitle>
                  <SelectorGrid>
                    {genres.map((genre) => (
                      <SelectorOption
                        key={genre}
                        $selected={selectedGenre === genre}
                        onClick={() => setSelectedGenre(genre)}
                      >
                        {t(`genre.${genre.toLowerCase()}` as any)}
                      </SelectorOption>
                    ))}
                  </SelectorGrid>

                  <SectionTitle>{t('mood.title')}</SectionTitle>
                  <SelectorGrid>
                    {moods.map((mood) => (
                      <SelectorOption
                        key={mood}
                        $selected={selectedMood === mood}
                        onClick={() => setSelectedMood(mood)}
                      >
                        {t(`mood.${mood.toLowerCase()}` as any)}
                      </SelectorOption>
                    ))}
                  </SelectorGrid>
                </>
              )}

              <Button $variant="ghost" onClick={() => setAdvancedOpen(!advancedOpen)}>
                <Sliders size={18} />
                {t('create.advancedSettings')}
              </Button>

              <AdvancedSettings $open={advancedOpen}>
                <SettingsGrid>
                  <SettingItem>
                    <SettingLabel>{t('create.vocals')}</SettingLabel>
                    <SelectInput value={vocals} onChange={(e) => setVocals(e.target.value as 'None' | 'Female' | 'Male')}>
                      <option value="None">{t('create.none')}</option>
                      <option value="Female">{t('create.female')}</option>
                      <option value="Male">{t('create.male')}</option>
                    </SelectInput>
                  </SettingItem>
                </SettingsGrid>

                {/* Extended Advanced Settings */}
                <AdvancedSection>
                  <AdvancedSectionTitle>
                    <Sliders size={16} />
                    {t('create.advancedControls', '高级控制')}
                  </AdvancedSectionTitle>

                  {/* Model Version Selector */}
                  <SettingItem style={{ marginBottom: '16px' }}>
                    <SettingLabel>{t('create.modelVersion', 'AI模型版本')}</SettingLabel>
                    <ModelVersionGrid>
                      {(['chirp-v3-5', 'chirp-v4', 'chirp-auk-turbo'] as const).map((version) => (
                        <ModelVersionOption
                          key={version}
                          $selected={modelVersion === version}
                          onClick={() => setModelVersion(version)}
                        >
                          {version.replace('chirp-', '').replace('-turbo', ' Turbo').toUpperCase()}
                        </ModelVersionOption>
                      ))}
                    </ModelVersionGrid>
                  </SettingItem>

                  {/* Vocal Gender - API uses 'm' for male, 'f' for female */}
                  <SettingItem style={{ marginBottom: '16px' }}>
                    <SettingLabel>{t('create.vocalGender', '声音性别')}</SettingLabel>
                    <SelectorGrid style={{ marginBottom: 0 }}>
                      {[
                        { value: 'm' as const, label: t('create.male', '男声') },
                        { value: 'f' as const, label: t('create.female', '女声') },
                        { value: '' as const, label: t('create.neutral', '不指定') }
                      ].map((option) => (
                        <SelectorOption
                          key={option.value}
                          $selected={vocalGender === option.value}
                          onClick={() => setVocalGender(option.value)}
                        >
                          {option.label}
                        </SelectorOption>
                      ))}
                    </SelectorGrid>
                  </SettingItem>

                  {/* Negative Tags */}
                  <SettingItem style={{ marginBottom: '16px' }}>
                    <SettingLabel>{t('create.negativeTags', '排除风格')}</SettingLabel>
                    <TagInput
                      type="text"
                      placeholder={t('create.negativeTagsPlaceholder', '例如: 重金属, 嘈杂, 电子...')}
                      value={negativeTags}
                      onChange={(e) => setNegativeTags(e.target.value)}
                    />
                  </SettingItem>

                  {/* Control Sliders - API expects 0-1 float values */}
                  <SliderContainer style={{ marginBottom: '16px' }}>
                    <SliderHeader>
                      <SettingLabel>{t('create.styleWeight', '风格匹配度')}</SettingLabel>
                      <SliderValue>{Math.round(styleWeight * 100)}%</SliderValue>
                    </SliderHeader>
                    <StyledSlider
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={styleWeight}
                      onChange={(e) => setStyleWeight(parseFloat(e.target.value))}
                    />
                  </SliderContainer>

                  <SliderContainer>
                    <SliderHeader>
                      <SettingLabel>{t('create.weirdnessConstraint', '创意程度')}</SettingLabel>
                      <SliderValue>{Math.round(weirdnessConstraint * 100)}%</SliderValue>
                    </SliderHeader>
                    <StyledSlider
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={weirdnessConstraint}
                      onChange={(e) => setWeirdnessConstraint(parseFloat(e.target.value))}
                    />
                  </SliderContainer>
                </AdvancedSection>
              </AdvancedSettings>

              <ErrorBanner $visible={errorVisible && !!currentError}>
                <ErrorIcon size={20} />
                <ErrorText>{currentError || t('common.error')}</ErrorText>
                <DismissButton onClick={handleDismissError}>
                  <Plus size={16} style={{ transform: 'rotate(45deg)' }} />
                </DismissButton>
              </ErrorBanner>

              <ActionButtons>
                {mode === 'custom' && (
                  <Button
                    $variant="secondary"
                    onClick={handleGenerateLyrics}
                    disabled={isGenerating}
                  >
                    {lyricsGeneration.status === 'generating' ? (
                      <>
                        <Loader2 size={18} className="spin" />
                        {t('create.generating')}
                      </>
                    ) : (
                      <>
                        <Wand2 size={18} />
                        {t('create.aiLyrics')}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  $variant="primary"
                  onClick={handleGenerateMusic}
                  disabled={isGenerating}
                  style={{ flex: mode === 'custom' ? 1 : 'auto', width: mode === 'inspiration' ? '100%' : undefined }}
                >
                  {musicGeneration.status === 'generating' ? (
                    <>
                      <Loader2 size={18} className="spin" />
                      {t('create.generatingMusic')}
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      {mode === 'inspiration' ? t('create.generateInspiration', 'AI创作') : t('create.generateBtn')}
                    </>
                  )}
                </Button>
              </ActionButtons>
            </GlassCard>
          </LeftPanel>

          <RightPanel>
            <PlayerCard>
              <PlayerCover>
                <PlayButtonOverlay
                  onClick={() => {
                    if (displayTrack?.audioUrl) {
                      if (currentTrack?.id === displayTrack.id && isPlaying) {
                        setIsPlaying(false);
                      } else {
                        setCurrentTrack(displayTrack);
                        setIsPlaying(true);
                      }
                    }
                  }}
                  style={{ opacity: displayTrack?.audioUrl ? 1 : 0.5, cursor: displayTrack?.audioUrl ? 'pointer' : 'not-allowed' }}
                >
                  {currentTrack?.id === displayTrack?.id && isPlaying ? (
                    <Pause size={28} color="white" />
                  ) : (
                    <Play size={28} color="white" fill="white" style={{ marginLeft: 4 }} />
                  )}
                </PlayButtonOverlay>
              </PlayerCover>
              <PlayerInfo>
                <PlayerTitle>{displayTrack?.title || t('player.noTrackSelected')}</PlayerTitle>
                <PlayerMeta>
                  {displayTrack?.audioUrl
                    ? displayTrack.duration
                      ? `${Math.floor(displayTrack.duration / 60)}:${(displayTrack.duration % 60).toString().padStart(2, '0')}`
                      : t('player.readyToPlay')
                    : t('player.selectOrCreateTrack')}
                </PlayerMeta>
              </PlayerInfo>
              <PlayerProgress onClick={handleProgressSeek}>
                <PlayerProgressBar
                  $progress={musicGeneration.status === 'generating'
                    ? musicGeneration.progress
                    : (playbackDuration > 0 ? progressPercent : (displayTrack?.duration ? 0 : 0))}
                  $hasTrack={!!displayTrack?.audioUrl}
                />
                {displayTrack?.audioUrl && playbackDuration === 0 && musicGeneration.status !== 'generating' && (
                  <PlayerProgressPlaceholder />
                )}
              </PlayerProgress>
              <PlayerTime>
                <span>
                  {musicGeneration.status === 'generating'
                    ? `${t('player.generating')} ${Math.round(musicGeneration.progress)}%`
                    : displayTrack?.audioUrl
                      ? formatTime(currentTime)
                      : '0:00'}
                </span>
                <span>
                  {musicGeneration.status === 'generating'
                    ? `${Math.round(musicGeneration.progress)}%`
                    : playbackDuration > 0
                      ? formatTime(playbackDuration)
                      : displayTrack?.duration
                        ? formatTime(displayTrack.duration)
                        : displayTrack?.audioUrl
                          ? '加载中...'
                          : '0:00'}
                </span>
              </PlayerTime>

              <LoadingOverlay $visible={musicGeneration.status === 'generating'}>
                <LoadingSpinner size="large" text={`${t('player.creating')} ${Math.round(musicGeneration.progress)}%`} />
                <ProgressBar>
                  <ProgressFill $progress={musicGeneration.progress} />
                </ProgressBar>
              </LoadingOverlay>
            </PlayerCard>
          </RightPanel>
        </TopSection>

        {/* Recent Tracks Section - Full Width Below */}
        <RecentSection>
          <RecentHeader>
            <RecentTitle>
              <Music2 size={22} />
              {t('recent.title')}
            </RecentTitle>
            <ViewAllButton onClick={() => setCurrentPage(1)}>
              {t('recent.viewAll')}
              <ChevronRight size={18} />
            </ViewAllButton>
          </RecentHeader>

          {isLoadingMore ? (
            <LoadingMore>
              <Loader2 size={24} className="spin" />
              {t('common.loading') || 'Loading...'}
            </LoadingMore>
          ) : displayTracks.length === 0 ? (
            <EmptyState>
              <EmptyIcon>
                <Music2 size={36} color="rgba(255,255,255,0.3)" />
              </EmptyIcon>
              <EmptyText>{t('recent.noTracks')}</EmptyText>
              <EmptySubtext>{t('recent.generateFirst')}</EmptySubtext>
            </EmptyState>
          ) : (
            <>
              <RecentGrid>
                {displayTracks.map((track) => {
                  const isActive = currentTrack?.id === track.id;
                  const isTrackPlaying = isActive && isPlaying;
                  const isProcessing = track.status === 'processing';
                  const isError = track.status === 'error';

                  return (
                    <RecentCard
                      key={track.id}
                      $isActive={isActive}
                      $menuOpen={openMenuId === track.id}
                      onClick={() => handlePlayTrack(track)}
                    >
                      <RecentCover $isPlaying={isTrackPlaying}>
                        {track.imageUrl ? (
                          <img
                            src={track.imageUrl}
                            alt={track.title || 'Track'}
                          />
                        ) : isProcessing ? (
                          <Loader2 size={26} className="spin" color="#667EEA" />
                        ) : isError ? (
                          <AlertCircle size={26} color="#F5576C" />
                        ) : isTrackPlaying ? (
                          <PlayingIndicator>
                            <SoundBar />
                            <SoundBar />
                            <SoundBar />
                          </PlayingIndicator>
                        ) : (
                          <Play size={26} color="#667EEA" fill="rgba(102, 126, 234, 0.3)" style={{ marginLeft: 3 }} />
                        )}
                        {/* 状态标签 */}
                        {isProcessing && (
                          <StatusBadge $status="processing">
                            {t('common.processing', '生成中')}
                          </StatusBadge>
                        )}
                        {isError && (
                          <StatusBadge $status="error">
                            {t('common.failed', '失败')}
                          </StatusBadge>
                        )}
                      </RecentCover>
                      <RecentInfo>
                        <RecentItemTitle>{track.title || t('recent.untitledTrack')}</RecentItemTitle>
                        <RecentMeta>
                          {isProcessing ? (
                            <RecentTag $processing>{t('common.generating', '生成中...')}</RecentTag>
                          ) : isError ? (
                            <RecentTag $error>{track.errorMessage || t('common.failed', '生成失败')}</RecentTag>
                          ) : (
                            <RecentTag>{track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : '0:00'}</RecentTag>
                          )}
                          {track.createdAt && <RecentTime>{formatDateTime(track.createdAt)}</RecentTime>}
                        </RecentMeta>
                      </RecentInfo>
                      <RecentActions>
                        <IconButton
                          onClick={(e) => handleToggleFavorite(e, track)}
                          style={{
                            color: favorites.has(track.id) ? '#F5576C' : undefined
                          }}
                        >
                          <Heart size={18} fill={favorites.has(track.id) ? '#F5576C' : 'none'} />
                        </IconButton>
                        <MoreMenuWrapper ref={openMenuId === track.id ? menuRef : null}>
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === track.id ? null : track.id);
                            }}
                            title={t('common.more')}
                          >
                            <MoreVertical size={18} />
                          </IconButton>
                          <MoreMenu $isOpen={openMenuId === track.id}>
                            <MoreMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadTrack(track);
                              }}
                              disabled={!track.audioUrl}
                            >
                              <Download size={16} />
                              {t('common.download')}
                            </MoreMenuItem>
                            <MoreMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareTrack(track);
                              }}
                            >
                              <Share2 size={16} />
                              {t('common.share')}
                            </MoreMenuItem>
                            <MoreMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyAudioUrl(track);
                              }}
                              disabled={!track.audioUrl}
                            >
                              <Link2 size={16} />
                              {t('common.copyAudioUrl')}
                            </MoreMenuItem>
                            <MenuDivider />
                            <MoreMenuItem
                              $danger
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTrack(track);
                              }}
                            >
                              <Trash2 size={16} />
                              {t('common.delete')}
                            </MoreMenuItem>
                          </MoreMenu>
                        </MoreMenuWrapper>
                      </RecentActions>
                    </RecentCard>
                  );
                })}
              </RecentGrid>

              {/* Pagination */}
              {displayTracks.length > 0 && (
                <PaginationContainer>
                  <PaginationButton
                    $disabled={currentPage === 1}
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={20} />
                  </PaginationButton>
                  <PageIndicator>
                    {currentPage} / {Math.max(totalPages, 1)}
                  </PageIndicator>
                  <PaginationButton
                    $disabled={currentPage === totalPages || totalPages <= 1}
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages || totalPages <= 1}
                  >
                    <ChevronRight size={20} />
                  </PaginationButton>
                </PaginationContainer>
              )}
            </>
          )}
        </RecentSection>
      </CreateContainer>
    </>
  );
};

export default CreateView;

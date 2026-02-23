import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Heart,
  Share2,
  Download
} from 'lucide-react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useAppStore } from '../hooks/useMusicStore';
import { AudioVisualizer } from './AudioVisualizer';

// ============ 样式组件 ============

const PlayerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const AlbumArt = styled.div<{ $isPlaying: boolean; $imageUrl?: string }>`
  width: 100%;
  height: 200px;
  ${props => props.$imageUrl
    ? `background-image: url(${props.$imageUrl});`
    : `background: linear-gradient(135deg, #667EEA, #764BA2, #F093FB);`
  }
  background-size: cover;
  background-position: center;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: transform 0.3s ease;

  ${props => props.$isPlaying && `
    animation: pulse 2s ease-in-out infinite;
  `}

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: ${props => props.$imageUrl
      ? 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)'
      : 'none'};
    border-radius: 20px;
  }
`;

const PlayButtonOverlay = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  z-index: 1;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }
`;

const SongInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
`;

const SongTitle = styled.h3`
  color: #FFFFFF;
  font-size: 20px;
  font-weight: 700;
  margin: 0;
`;

const SongMeta = styled.span`
  color: #8B8B9F;
  font-size: 13px;
`;

const ProgressBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
`;

const ProgressFill = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: linear-gradient(90deg, #667EEA, #764BA2);
  border-radius: 2px;
  transition: width 0.1s ease;
`;

const TimeRow = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
`;

const TimeDisplay = styled.span`
  color: #8B8B9F;
  font-size: 11px;
  font-family: 'IBM Plex Mono', monospace;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
`;

const ControlButton = styled.button<{ $primary?: boolean }>`
  width: ${props => props.$primary ? '56px' : '44px'};
  height: ${props => props.$primary ? '56px' : '44px'};
  border: none;
  border-radius: ${props => props.$primary ? '28px' : '22px'};
  background: ${props => props.$primary
    ? 'linear-gradient(135deg, #667EEA, #764BA2)'
    : 'rgba(255, 255, 255, 0.08)'};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #FFFFFF;

  &:hover {
    transform: scale(1.05);
    background: ${props => props.$primary
      ? 'linear-gradient(135deg, #667EEA, #764BA2)'
      : 'rgba(255, 255, 255, 0.12)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ExtraControls = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
`;

const VolumeControl = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const VolumeSlider = styled.div`
  width: 80px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
`;

const VolumeFill = styled.div<{ $volume: number }>`
  width: ${props => props.$volume}%;
  height: 100%;
  background: #667EEA;
  border-radius: 2px;
`;

const IconButton = styled.button<{ $active?: boolean }>`
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${props => props.$active ? '#667EEA' : '#8B8B9F'};
  transition: color 0.2s ease;

  &:hover {
    color: #667EEA;
  }
`;

// ============ 主播放器组件 ============

interface AudioPlayerProps {
  onNext?: () => void;
  onPrevious?: () => void;
  onLike?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  onNext,
  onPrevious,
  onLike,
  onShare,
  onDownload,
}) => {
  const { t } = useTranslation();
  const { currentTrack, recentTracks } = useAppStore();

  // Get audio URL from current track
  const audioUrl = currentTrack?.audioUrl;

  // Use the audio player hook
  const {
    play,
    pause,
    seek,
    setVolume: setAudioVolume,
    currentTime,
    duration,
    isPlaying,
    audioRef,
    analyser,
  } = useAudioPlayer(audioUrl);

  // Local state
  const [volume, setVolume] = useState(70);
  const [isLooping, setIsLooping] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  // Update volume when it changes
  useEffect(() => {
    setAudioVolume(volume / 100);
  }, [volume, setAudioVolume]);

  // Handle track change
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.load();
    }
  }, [audioUrl, audioRef]);

  // Sync isPlaying state with store
  useEffect(() => {
    const store = useAppStore.getState();
    store.setIsPlaying(isPlaying);
  }, [isPlaying]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handlePlayPause = useCallback(() => {
    if (!audioUrl) return;

    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause, audioUrl]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    seek(newTime);
  }, [duration, seek]);

  const toggleLoop = () => {
    setIsLooping(!isLooping);
    if (audioRef.current) {
      audioRef.current.loop = !isLooping;
    }
  };

  const toggleLike = () => {
    setIsLiked(!isLiked);
    onLike?.();
  };

  // Get track info
  const title = currentTrack?.title || 'No Track Selected';
  const displayDuration = duration || currentTrack?.duration || 0;
  const imageUrl = currentTrack?.imageUrl;

  const canPlay = !!audioUrl;

  return (
    <PlayerContainer>
      <audio
        ref={audioRef}
        src={audioUrl}
      />

      <AlbumArt $isPlaying={isPlaying && canPlay} $imageUrl={imageUrl}>
        <PlayButtonOverlay onClick={handlePlayPause} disabled={!canPlay}>
          {isPlaying && canPlay ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: 4 }} />}
        </PlayButtonOverlay>
      </AlbumArt>

      <SongInfo>
        <SongTitle>{title}</SongTitle>
        <SongMeta>{canPlay ? formatTime(displayDuration) : '--:--'}</SongMeta>
      </SongInfo>

      <AudioVisualizer analyser={analyser} isPlaying={isPlaying && canPlay} />

      <ProgressBar>
        <ProgressTrack onClick={handleSeek} style={{ cursor: canPlay ? 'pointer' : 'not-allowed' }}>
          <ProgressFill $progress={progress} />
        </ProgressTrack>
        <TimeRow>
          <TimeDisplay>{formatTime(currentTime)}</TimeDisplay>
          <TimeDisplay>{formatTime(displayDuration)}</TimeDisplay>
        </TimeRow>
      </ProgressBar>

      <Controls>
        <ControlButton onClick={onPrevious} disabled={!onPrevious}>
          <SkipBack size={20} />
        </ControlButton>
        <ControlButton $primary onClick={handlePlayPause} disabled={!canPlay}>
          {isPlaying && canPlay ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
        </ControlButton>
        <ControlButton onClick={onNext} disabled={!onNext}>
          <SkipForward size={20} />
        </ControlButton>
      </Controls>

      <ExtraControls>
        <VolumeControl>
          <Volume2 size={18} />
          <VolumeSlider onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = ((e.clientX - rect.left) / rect.width) * 100;
            setVolume(Math.max(0, Math.min(100, pos)));
          }}>
            <VolumeFill $volume={volume} />
          </VolumeSlider>
        </VolumeControl>

        <IconButton $active={isLooping} onClick={toggleLoop}>
          <Repeat size={18} />
        </IconButton>

        <IconButton $active={isLiked} onClick={toggleLike}>
          <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
        </IconButton>

        <IconButton onClick={onShare}>
          <Share2 size={18} />
        </IconButton>

        <IconButton onClick={onDownload} disabled={!canPlay}>
          <Download size={18} />
        </IconButton>
      </ExtraControls>
    </PlayerContainer>
  );
};

export default AudioPlayer;

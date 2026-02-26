import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Heart,
  X
} from 'lucide-react';
import { useAppStore } from '../hooks/useMusicStore';
import { musicApi } from '../services/api';
import { useToast } from '../hooks/useToast';

const PlayerBar = styled.div<{ $visible: boolean }>`
  position: fixed;
  bottom: 0;
  left: 260px;
  right: 0;
  height: 72px;
  background: #FFFFFF;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: ${props => props.$visible ? 'flex' : 'none'};
  align-items: center;
  padding: 0 24px;
  gap: 16px;
  z-index: 1000;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.04);

  @media (max-width: 1200px) {
    left: 0;
  }
`;

const TrackInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
  flex: 0 0 200px;
`;

const TrackCover = styled.div<{ $imageUrl?: string }>`
  width: 52px;
  height: 52px;
  border-radius: 6px;
  background: ${props => props.$imageUrl
    ? `url(${props.$imageUrl}) center/cover`
    : 'linear-gradient(135deg, #FA2D48, #FC3C44)'};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    : 'linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(118, 75, 162, 0.3))'};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const TrackDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
`;

const TrackTitle = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1D1D1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TrackMeta = styled.span`
  font-size: 0.75rem;
  color: #86868B;
`;

const PlayerControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ControlButton = styled.button<{ $primary?: boolean }>`
  width: ${props => props.$primary ? '40px' : '32px'};
  height: ${props => props.$primary ? '40px' : '32px'};
  border: none;
  border-radius: ${props => props.$primary ? '50%' : '6px'};
  background: ${props => props.$primary
    ? '#FA2D48'
    : 'transparent'};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${props => props.$primary ? '#FFFFFF' : '#6E6E73'};
  transition: all 0.15s ease;

  &:hover {
    transform: ${props => props.$primary ? 'scale(1.05)' : 'none'};
    background: ${props => props.$primary
      ? '#D91E36'
      : 'rgba(0, 0, 0, 0.04)'};
    color: ${props => props.$primary ? '#FFFFFF' : '#1D1D1F'};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }
`;

const ProgressSection = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TimeDisplay = styled.span`
  font-size: 0.6875rem;
  color: #86868B;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', monospace;
  min-width: 36px;

  &:first-child {
    text-align: right;
  }
`;

const ProgressBar = styled.div`
  flex: 1;
  height: 4px;
  background: #E8E8ED;
  border-radius: 2px;
  cursor: pointer;
  position: relative;

  &:hover {
    height: 6px;
  }
`;

const ProgressFill = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: #FA2D48;
  border-radius: 2px;
  transition: width 0.1s ease;
`;

const VolumeSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
`;

const VolumeButton = styled.button`
  background: none;
  border: none;
  color: #6E6E73;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: #1D1D1F;
  }
`;

const VolumeSlider = styled.div`
  width: 70px;
  height: 4px;
  background: #E8E8ED;
  border-radius: 2px;
  cursor: pointer;
  position: relative;
`;

const VolumeFill = styled.div<{ $volume: number }>`
  width: ${props => props.$volume}%;
  height: 100%;
  background: #FA2D48;
  border-radius: 2px;
`;

const ActionButton = styled.button<{ $active?: boolean }>`
  background: none;
  border: none;
  color: ${props => props.$active ? '#FA2D48' : '#6E6E73'};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: ${props => props.$active ? '#FA2D48' : '#1D1D1F'};
  }
`;

export const BottomPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    setIsPlaying,
    setCurrentTrack,
    recentTracks,
    currentTime,
    duration,
    setCurrentTime: setStoreCurrentTime,
    setDuration: setStoreDuration,
    setSeekListener,
  } = useAppStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(70);
  const [isDragging, setIsDragging] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const { showSuccess, showError } = useToast();

  const audioUrl = currentTrack?.audioUrl;
  const isVisible = !!currentTrack;

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setStoreCurrentTime(time);
    };
    const handleLoadedMetadata = () => {
      const dur = audio.duration;
      setStoreDuration(dur);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setStoreCurrentTime(0);
      setStoreCurrentTime(0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [setIsPlaying, setStoreCurrentTime, setStoreDuration]);

  // Fallback: ensure progress/time stay in sync while playing
  useEffect(() => {
    let frameId: number;

    const syncPlaybackState = () => {
      const audio = audioRef.current;
      if (audio && isPlaying) {
        const time = audio.currentTime;
        const dur = audio.duration;

        if (!isNaN(time)) {
          setStoreCurrentTime(time);
        }

        if (!isNaN(dur) && dur > 0) {
          setStoreDuration(dur);
        }

        frameId = requestAnimationFrame(syncPlaybackState);
      }
    };

    if (isPlaying) {
      frameId = requestAnimationFrame(syncPlaybackState);
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isPlaying, setStoreCurrentTime, setStoreDuration]);

  // Load and play/pause when URL or isPlaying changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
    }

    if (isPlaying) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [audioUrl, isPlaying]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Register seek listener for external components
  useEffect(() => {
    setSeekListener((time: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        setStoreCurrentTime(time);
      }
    });
    return () => setSeekListener(null);
  }, [setSeekListener]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Use audio duration or fallback to track duration
  const effectiveDuration = duration || (currentTrack?.duration || 0);

  const handlePlayPause = useCallback(() => {
    if (!audioUrl) return;
    setIsPlaying(!isPlaying);
  }, [audioUrl, isPlaying, setIsPlaying]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!effectiveDuration || !audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * effectiveDuration;
    audioRef.current.currentTime = newTime;
    setStoreCurrentTime(newTime);
  }, [effectiveDuration]);

  // Handle progress bar drag
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!effectiveDuration) return;
    setIsDragging(true);
    handleSeek(e);
  }, [effectiveDuration, handleSeek]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!progressRef.current || !effectiveDuration || !audioRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = pos * effectiveDuration;
      setStoreCurrentTime(newTime);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (progressRef.current && effectiveDuration && audioRef.current) {
        const rect = progressRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = pos * effectiveDuration;
        audioRef.current.currentTime = newTime;
      }
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, effectiveDuration]);

  const handleVolumeChange = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = ((e.clientX - rect.left) / rect.width) * 100;
    setVolume(Math.max(0, Math.min(100, pos)));
  }, []);

  const handleClose = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTrack(null);
  }, [setIsPlaying, setCurrentTrack]);

  const handlePrevious = useCallback(() => {
    if (!currentTrack || recentTracks.length === 0) return;
    const currentIndex = recentTracks.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
      setCurrentTrack(recentTracks[currentIndex - 1]);
    }
  }, [currentTrack, recentTracks, setCurrentTrack]);

  const handleNext = useCallback(() => {
    if (!currentTrack || recentTracks.length === 0) return;
    const currentIndex = recentTracks.findIndex(t => t.id === currentTrack.id);
    if (currentIndex < recentTracks.length - 1) {
      setCurrentTrack(recentTracks[currentIndex + 1]);
    }
  }, [currentTrack, recentTracks, setCurrentTrack]);

  // Handle favorite toggle
  const handleToggleFavorite = useCallback(async () => {
    if (!currentTrack?.id) return;

    try {
      const response = await musicApi.toggleFavorite(currentTrack.id);
      if (response.success) {
        setIsFavorite(!isFavorite);
        showSuccess(
          isFavorite ? 'Removed from favorites' : 'Added to favorites',
          'Success'
        );
      }
    } catch (error) {
      showError('Failed to update favorite status', 'Error');
    }
  }, [currentTrack, isFavorite, showSuccess, showError]);

  if (!isVisible) return null;

  return (
    <>
      <audio ref={audioRef} />
      <PlayerBar $visible={isVisible}>
        <TrackInfo>
          <TrackCover $imageUrl={currentTrack?.imageUrl}>
            {!currentTrack?.imageUrl && (
              <Play size={20} color="#667EEA" fill="rgba(102, 126, 234, 0.3)" />
            )}
          </TrackCover>
          <TrackDetails>
            <TrackTitle>{currentTrack?.title || 'Unknown Track'}</TrackTitle>
            <TrackMeta>
              {formatTime(duration || currentTrack?.duration || 0)}
            </TrackMeta>
          </TrackDetails>
        </TrackInfo>

        <PlayerControls>
          <ControlButton onClick={handlePrevious} disabled={recentTracks.length <= 1}>
            <SkipBack size={16} />
          </ControlButton>
          <ControlButton $primary onClick={handlePlayPause}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
          </ControlButton>
          <ControlButton onClick={handleNext} disabled={recentTracks.length <= 1}>
            <SkipForward size={16} />
          </ControlButton>
        </PlayerControls>

        <ProgressSection>
          <TimeDisplay>{formatTime(currentTime)}</TimeDisplay>
          <ProgressBar ref={progressRef} onMouseDown={handleMouseDown} style={{ cursor: 'pointer' }}>
            <ProgressFill $progress={progress} />
          </ProgressBar>
          <TimeDisplay>{formatTime(effectiveDuration)}</TimeDisplay>
        </ProgressSection>

        <VolumeSection>
          <VolumeButton onClick={() => setVolume(volume > 0 ? 0 : 70)}>
            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </VolumeButton>
          <VolumeSlider onClick={handleVolumeChange}>
            <VolumeFill $volume={volume} />
          </VolumeSlider>
        </VolumeSection>

        <ActionButton $active={isFavorite} onClick={handleToggleFavorite}>
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        </ActionButton>
        <ActionButton onClick={handleClose}>
          <X size={18} />
        </ActionButton>
      </PlayerBar>
    </>
  );
};

export default BottomPlayer;

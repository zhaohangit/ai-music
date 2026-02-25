import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  Heart,
  MoreVertical,
  Download,
  Share2,
  Search,
  Grid3x3,
  List,
  Filter,
  Music,
  Clock,
  Loader2,
  Trash2,
  Scissors,
  Sparkles,
  Video,
  Gauge,
  Disc,
  FileAudio,
  Music2,
  Mic2
} from 'lucide-react';
import { musicApi, MusicInfo } from '../services/api';
import { useAppStore } from '../hooks/useMusicStore';
import { downloadFile, shareTrack } from '../utils/helpers';
import { useToast } from '../hooks/useToast';
import ExtendModal from '../components/ExtendModal';
import RemasterModal from '../components/RemasterModal';
import CropModal from '../components/CropModal';
import SpeedModal from '../components/SpeedModal';
import VideoModal from '../components/VideoModal';
import WavModal from '../components/WavModal';
import WholeSongModal from '../components/WholeSongModal';
import AlignedLyricsModal from '../components/AlignedLyricsModal';

const LibraryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const LibraryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const LibraryTitle = styled.h1`
  font-size: 1.625rem;
  font-weight: 700;
  color: #1D1D1F;
  margin: 0;
  letter-spacing: -0.02em;
`;

const LibrarySubtitle = styled.p`
  font-size: 0.875rem;
  color: #86868B;
  margin: 4px 0 0 0;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: #F5F5F7;
  border-radius: 8px;
  padding: 8px 12px;
  width: 240px;

  &:focus-within {
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.1);
  }
`;

const SearchInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: #1D1D1F;
  font-size: 0.8125rem;
  outline: none;

  &::placeholder {
    color: #86868B;
  }
`;

const ViewToggle = styled.div`
  display: flex;
  background: #F5F5F7;
  border-radius: 8px;
  padding: 2px;
`;

const ViewButton = styled.button<{ $active?: boolean }>`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$active ? '#FFFFFF' : 'transparent'};
  border-radius: 6px;
  color: ${props => props.$active ? '#1D1D1F' : '#86868B'};
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: ${props => props.$active ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none'};

  &:hover {
    color: #1D1D1F;
  }
`;

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: ${props => props.$active ? 'rgba(250, 45, 72, 0.1)' : '#FFFFFF'};
  border: 1px solid ${props => props.$active ? 'rgba(250, 45, 72, 0.3)' : 'rgba(0, 0, 0, 0.1)'};
  border-radius: 16px;
  color: ${props => props.$active ? '#FA2D48' : '#1D1D1F'};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$active ? 'rgba(250, 45, 72, 0.15)' : '#F5F5F7'};
    border-color: ${props => props.$active ? 'rgba(250, 45, 72, 0.4)' : 'rgba(0, 0, 0, 0.15)'};
    color: ${props => props.$active ? '#FA2D48' : '#1D1D1F'};
  }
`;

const MusicGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 20px;
`;

const CardOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: 1;
`;

const PlayOverlayButton = styled.button`
  width: 44px;
  height: 44px;
  background: #FA2D48;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(250, 45, 72, 0.4);
  transition: transform 0.15s ease;
  pointer-events: auto;
  cursor: pointer;

  &:hover {
    transform: scale(1.08);
  }
`;

const MusicCard = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
  cursor: pointer;
  position: relative;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.15);

    ${CardOverlay} {
      opacity: 1;
    }
  }
`;

const CardCover = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  aspect-ratio: 1;
  background: ${props => props.$imageUrl
    ? `url(${props.$imageUrl}) center/cover`
    : 'linear-gradient(135deg, #FA2D48, #FC3C44)'};
  border-radius: 6px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
`;

const CardInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CardTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #86868B;
`;

const CardGenre = styled.span`
  background: rgba(250, 45, 72, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  color: #FA2D48;
  font-size: 0.6875rem;
  font-weight: 500;
`;

const CardStatus = styled.span<{ $status?: string }>`
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
  background: ${props => {
    switch (props.$status) {
      case 'complete': return 'rgba(52, 199, 89, 0.12)';
      case 'processing': return 'rgba(255, 149, 0, 0.12)';
      case 'error': return 'rgba(255, 59, 48, 0.12)';
      default: return 'rgba(142, 142, 147, 0.12)';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case 'complete': return '#34C759';
      case 'processing': return '#FF9500';
      case 'error': return '#FF3B30';
      default: return '#8E8E93';
    }
  }};
`;

const CardActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
`;

const CardActionButton = styled.button<{ $active?: boolean; $variant?: 'default' | 'danger' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px;
  min-width: 28px;
  background: ${props => {
    if (props.$variant === 'danger') return 'rgba(255, 59, 48, 0.08)';
    return props.$active ? 'rgba(250, 45, 72, 0.1)' : '#FFFFFF';
  }};
  border: 1px solid ${props => {
    if (props.$variant === 'danger') return 'rgba(255, 59, 48, 0.2)';
    return props.$active ? 'rgba(250, 45, 72, 0.3)' : 'rgba(0, 0, 0, 0.1)';
  }};
  border-radius: 6px;
  color: ${props => {
    if (props.$variant === 'danger') return '#FF3B30';
    return props.$active ? '#FA2D48' : '#1D1D1F';
  }};
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: ${props => props.$variant === 'danger' ? 'rgba(255, 59, 48, 0.15)' : '#F5F5F7'};
    border-color: ${props => props.$variant === 'danger' ? 'rgba(255, 59, 48, 0.3)' : 'rgba(0, 0, 0, 0.2)'};
    color: ${props => props.$variant === 'danger' ? '#FF3B30' : '#FA2D48'};
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    pointer-events: none;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  width: 72px;
  height: 72px;
  background: rgba(250, 45, 72, 0.1);
  border: 1px solid rgba(250, 45, 72, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
`;

const EmptyTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 6px 0;
`;

const EmptyDescription = styled.p`
  font-size: 0.875rem;
  color: #86868B;
  margin: 0;
  max-width: 300px;
  line-height: 1.4;
`;

const EmptyButton = styled.button`
  margin-top: 20px;
  padding: 10px 20px;
  background: #FA2D48;
  border: none;
  border-radius: 20px;
  color: #FFFFFF;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #D91E36;
  }
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  gap: 12px;
`;

const LoadingText = styled.p`
  font-size: 0.875rem;
  color: #86868B;
  margin: 0;
`;

const ErrorMessage = styled.div`
  background: rgba(255, 59, 48, 0.08);
  border-radius: 10px;
  padding: 14px;
  color: #FF3B30;
  font-size: 0.8125rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const RetryButton = styled.button`
  padding: 6px 12px;
  background: rgba(255, 59, 48, 0.12);
  border: none;
  border-radius: 6px;
  color: #FF3B30;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(255, 59, 48, 0.2);
  }
`;

interface MusicTrack {
  id: string;
  title: string;
  genre: string;
  duration: string;
  createdAt: string;
  status: 'processing' | 'complete' | 'error';
  imageUrl?: string;
  audioUrl?: string;
}

// Helper function to convert MusicInfo to MusicTrack
const toMusicTrack = (music: MusicInfo): MusicTrack => {
  const duration = music.duration
    ? `${Math.floor(music.duration / 60)}:${(music.duration % 60).toString().padStart(2, '0')}`
    : '--:--';

  const createdAt = music.createdAt
    ? new Date(music.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    : 'Unknown';

  // 使用 tags 数组的第一个元素作为 genre，如果没有则使用 'AI Generated'
  const genre = music.tags && music.tags.length > 0 ? music.tags[0] : 'AI Generated';

  // 如果没有 status 或者 status 无效，默认为 'complete'（已有音频的默认可操作）
  const validStatuses = ['processing', 'complete', 'error'] as const;
  const status = music.status && validStatuses.includes(music.status as typeof validStatuses[number])
    ? music.status as 'processing' | 'complete' | 'error'
    : 'complete';

  return {
    id: music.id,
    title: music.title || 'Untitled Track',
    genre,
    duration,
    createdAt,
    status,
    imageUrl: music.imageUrl,
    audioUrl: music.audioUrl,
  };
};

// Format duration in seconds to mm:ss
const formatDuration = (seconds?: number): string => {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Format date to relative time
const formatRelativeTime = (dateString?: string): string => {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const LibraryView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    // Initialize from localStorage for faster loading
    try {
      const saved = localStorage.getItem('music-favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Extend modal state
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [selectedTrackForExtend, setSelectedTrackForExtend] = useState<MusicTrack | null>(null);

  // Remaster modal state
  const [remasterModalOpen, setRemasterModalOpen] = useState(false);
  const [selectedTrackForRemaster, setSelectedTrackForRemaster] = useState<MusicTrack | null>(null);

  // Crop modal state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedTrackForCrop, setSelectedTrackForCrop] = useState<MusicTrack | null>(null);

  // Speed modal state
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [selectedTrackForSpeed, setSelectedTrackForSpeed] = useState<MusicTrack | null>(null);

  // Video modal state
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedTrackForVideo, setSelectedTrackForVideo] = useState<MusicTrack | null>(null);

  // WAV modal state
  const [wavModalOpen, setWavModalOpen] = useState(false);
  const [selectedTrackForWav, setSelectedTrackForWav] = useState<MusicTrack | null>(null);

  // WholeSong modal state
  const [wholeSongModalOpen, setWholeSongModalOpen] = useState(false);
  const [selectedTrackForWholeSong, setSelectedTrackForWholeSong] = useState<MusicTrack | null>(null);

  // AlignedLyrics modal state
  const [alignedLyricsModalOpen, setAlignedLyricsModalOpen] = useState(false);
  const [selectedTrackForAlignedLyrics, setSelectedTrackForAlignedLyrics] = useState<MusicTrack | null>(null);

  const { recentTracks, setCurrentTrack, setIsPlaying, currentTrack, isPlaying, dataVersion } = useAppStore();

  // Fetch tracks from API
  const fetchTracks = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both regular list and favorites list in parallel
      const [listResponse, favoritesResponse] = await Promise.all([
        musicApi.getList(1, 50),
        musicApi.getList(1, 100, undefined, true) // Get favorites list
      ]);

      if (listResponse.success && listResponse.data) {
        const apiTracks = Array.isArray(listResponse.data)
          ? listResponse.data
          : listResponse.data.items || listResponse.data.tracks || [];

        const convertedTracks = apiTracks.map(toMusicTrack);
        setTracks(convertedTracks);
      } else {
        // If API returns empty or fails, use store's recent tracks as fallback
        const storeTracks = recentTracks.map(toMusicTrack);
        setTracks(storeTracks);
      }

      // Sync favorites from favorites API response
      if (favoritesResponse.success && favoritesResponse.data) {
        const favoriteTracks = Array.isArray(favoritesResponse.data)
          ? favoritesResponse.data
          : (favoritesResponse.data as any).items || (favoritesResponse.data as any).tracks || [];

        const favoriteIds = new Set<string>(favoriteTracks.map((track: any) => track.id as string));
        setFavorites(favoriteIds);

        // Persist to localStorage
        try {
          localStorage.setItem('music-favorites', JSON.stringify([...favoriteIds]));
        } catch (e) {
          console.warn('Failed to save favorites to localStorage:', e);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tracks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracks');

      // Fallback to store's recent tracks
      const storeTracks = recentTracks.map(toMusicTrack);
      setTracks(storeTracks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, [dataVersion]);

  // Toggle favorite status
  const toggleFavorite = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    try {
      await musicApi.toggleFavorite(trackId);
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (newFavorites.has(trackId)) {
          newFavorites.delete(trackId);
          showSuccess(t('common.removedFromFavorites'), t('common.success'));
        } else {
          newFavorites.add(trackId);
          showSuccess(t('common.addedToFavorites'), t('common.success'));
        }
        // Persist to localStorage
        try {
          localStorage.setItem('music-favorites', JSON.stringify([...newFavorites]));
        } catch (e) {
          console.warn('Failed to save favorites to localStorage:', e);
        }
        return newFavorites;
      });
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      showError(t('common.favoriteFailed'), t('common.error'));
    }
  };

  // Delete track
  const deleteTrack = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (!confirm(t('common.confirmDelete'))) {
      return;
    }

    try {
      await musicApi.delete(trackId);
      setTracks(prev => prev.filter(t => t.id !== trackId));
      showSuccess(t('common.trackDeleted'), t('common.success'));
    } catch (err) {
      console.error('Failed to delete track:', err);
      showError(t('common.deleteFailed'), t('common.error'));
    }
  };

  // Handle play/pause
  const handlePlayPause = (e: React.MouseEvent | undefined, track: MusicTrack) => {
    e?.stopPropagation();

    // 使用 track 的 audioUrl，如果没有则尝试使用下载接口
    const audioUrl = track.audioUrl || (track.status === 'complete' ? `/api/music/${track.id}/download` : undefined);

    const musicInfo: MusicInfo = {
      id: track.id,
      status: track.status,
      title: track.title,
      imageUrl: track.imageUrl,
      audioUrl,
    };

    if (currentTrack?.id === track.id && isPlaying) {
      setIsPlaying(false);
    } else {
      setCurrentTrack(musicInfo);
      setIsPlaying(true);
    }
  };

  // Handle download
  const handleDownload = async (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();

    if (track.status !== 'complete') {
      showError(t('common.trackNotReady'), t('common.downloadFailed'));
      return;
    }

    try {
      const filename = `${track.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
      const audioUrl = `/api/music/${track.id}/download`;
      await downloadFile(audioUrl, filename);
      showSuccess(t('common.downloadStarted'), t('common.success'));
    } catch (err) {
      console.error('Download error:', err);
      showError(t('common.downloadFailed'), t('common.error'));
    }
  };

  // Handle share
  const handleShare = async (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();

    const musicInfo: MusicInfo = {
      id: track.id,
      status: track.status,
      title: track.title,
      imageUrl: track.imageUrl,
      audioUrl: track.status === 'complete' ? `${window.location.origin}/track/${track.id}` : undefined,
    };

    try {
      await shareTrack(musicInfo);
      showSuccess(t('common.linkCopied'), t('common.success'));
    } catch (err) {
      console.error('Share error:', err);
      showError(t('common.copyFailed'), t('common.error'));
    }
  };

  // Handle extend
  const handleExtend = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForExtend(track);
    setExtendModalOpen(true);
  };

  // Handle extend success
  const handleExtendSuccess = (taskId: string) => {
    showSuccess('续写任务已创建，请稍后查看结果', '续写成功');
    fetchTracks(); // Refresh the track list
  };

  // Handle remaster
  const handleRemaster = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForRemaster(track);
    setRemasterModalOpen(true);
  };

  // Handle remaster success
  const handleRemasterSuccess = (taskIds: string[]) => {
    showSuccess('Remaster任务已创建，请稍后查看结果', 'Remaster成功');
    fetchTracks();
  };

  // Handle crop
  const handleCrop = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForCrop(track);
    setCropModalOpen(true);
  };

  // Handle crop success
  const handleCropSuccess = (taskId: string) => {
    showSuccess('裁剪任务已创建，请稍后查看结果', '裁剪成功');
    fetchTracks();
  };

  // Handle speed
  const handleSpeed = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForSpeed(track);
    setSpeedModalOpen(true);
  };

  // Handle speed success
  const handleSpeedSuccess = (taskId: string) => {
    showSuccess('变速任务已创建，请稍后查看结果', '变速成功');
    fetchTracks();
  };

  // Handle video
  const handleVideo = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForVideo(track);
    setVideoModalOpen(true);
  };

  // Handle video success
  const handleVideoSuccess = (taskId: string) => {
    showSuccess('视频生成任务已创建，请稍后查看结果', '视频生成成功');
    fetchTracks();
  };

  // Handle WAV conversion
  const handleWav = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForWav(track);
    setWavModalOpen(true);
  };

  // Handle WAV conversion success
  const handleWavSuccess = (taskId: string) => {
    showSuccess('WAV转换任务已创建，请稍后查看结果', '转换成功');
    fetchTracks();
  };

  // Handle whole song
  const handleWholeSong = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForWholeSong(track);
    setWholeSongModalOpen(true);
  };

  // Handle whole song success
  const handleWholeSongSuccess = (taskId: string) => {
    showSuccess('获取整首歌任务已创建，请稍后查看结果', '任务创建成功');
    fetchTracks();
  };

  // Handle aligned lyrics
  const handleAlignedLyrics = (e: React.MouseEvent, track: MusicTrack) => {
    e.stopPropagation();
    setSelectedTrackForAlignedLyrics(track);
    setAlignedLyricsModalOpen(true);
  };

  // Handle aligned lyrics success
  const handleAlignedLyricsSuccess = (taskId: string) => {
    showSuccess('歌词时间戳任务已创建，请稍后查看结果', '任务创建成功');
    fetchTracks();
  };

  // Filter tracks based on selected filter and search query
  const filteredTracks = tracks.filter(track => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!track.title.toLowerCase().includes(query) &&
          !track.genre.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Category filter
    switch (selectedFilter) {
      case 'all':
        return true;
      case 'favorites':
        return favorites.has(track.id);
      case 'recent':
        // Show tracks from last 7 days
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return track.status === 'complete';
      case 'processing':
        return track.status === 'processing';
      case 'complete':
        return track.status === 'complete';
      case 'error':
        return track.status === 'error';
      default:
        // Genre filter
        return track.genre.toLowerCase().includes(selectedFilter.toLowerCase());
    }
  });

  const filters = [
    { id: 'all', label: t('library.allTracks') },
    { id: 'favorites', label: t('library.favorites') },
    { id: 'recent', label: t('library.recent') },
  ];

  const genres = ['Pop', 'Electronic', 'Rock', 'Jazz', 'Classical', 'Hip-Hop', 'Lo-Fi'];

  return (
    <LibraryContainer>
      <LibraryHeader>
        <div>
          <LibraryTitle>{t('library.title')}</LibraryTitle>
          <LibrarySubtitle>
            {loading ? t('common.loading') : `${tracks.length} ${t('common.tracks')}`}
          </LibrarySubtitle>
        </div>
        <HeaderActions>
          <SearchBar>
            <Search size={18} color="#8B8B9F" />
            <SearchInput
              type="text"
              placeholder={t('common.search') + '...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SearchBar>
          <ViewToggle>
            <ViewButton $active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
              <Grid3x3 size={18} />
            </ViewButton>
            <ViewButton $active={viewMode === 'list'} onClick={() => setViewMode('list')}>
              <List size={18} />
            </ViewButton>
          </ViewToggle>
        </HeaderActions>
      </LibraryHeader>

      <FilterBar>
        {filters.map((filter) => (
          <FilterButton
            key={filter.id}
            $active={selectedFilter === filter.id}
            onClick={() => setSelectedFilter(filter.id)}
          >
            {filter.id === 'favorites' && <Heart size={16} />}
            {filter.id === 'recent' && <Clock size={16} />}
            {filter.label}
          </FilterButton>
        ))}
        {genres.map((genre) => (
          <FilterButton
            key={genre}
            $active={selectedFilter === genre}
            onClick={() => setSelectedFilter(genre)}
          >
            {genre}
          </FilterButton>
        ))}
      </FilterBar>

      {error && (
        <ErrorMessage>
          <span>{error}</span>
          <RetryButton onClick={fetchTracks}>{t('common.retry', '重试')}</RetryButton>
        </ErrorMessage>
      )}

      {loading ? (
        <LoadingState>
          <Loader2 size={40} color="#FA2D48" className="spin" />
          <LoadingText>{t('common.loading')}</LoadingText>
        </LoadingState>
      ) : filteredTracks.length > 0 ? (
        <MusicGrid>
          {filteredTracks.map((track) => (
            <MusicCard
              key={track.id}
              onClick={() => handlePlayPause(undefined as unknown as React.MouseEvent, track)}
            >
              <CardOverlay>
                <PlayOverlayButton onClick={(e) => handlePlayPause(e, track)}>
                  {currentTrack?.id === track.id && isPlaying ? (
                    <Pause size={24} color="white" fill="white" />
                  ) : (
                    <Play size={24} color="white" fill="white" />
                  )}
                </PlayOverlayButton>
              </CardOverlay>
              <CardCover $imageUrl={track.imageUrl}>
                {!track.imageUrl && <Music size={40} color="#FFFFFF" strokeWidth={1.5} />}
              </CardCover>
              <CardInfo>
                <CardTitle>{track.title}</CardTitle>
                <CardMeta>
                  <span>{track.duration}</span>
                  <CardGenre>{track.genre}</CardGenre>
                </CardMeta>
              </CardInfo>
              <CardActions>
                <CardActionButton
                  $active={favorites.has(track.id)}
                  onClick={(e) => toggleFavorite(e, track.id)}
                >
                  <Heart size={14} fill={favorites.has(track.id) ? 'currentColor' : 'none'} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleExtend(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.extend', '续写歌曲')}
                >
                  <Scissors size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleRemaster(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.remaster', 'Remaster')}
                >
                  <Sparkles size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleCrop(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.crop', '裁剪')}
                >
                  <Disc size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleSpeed(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.speed', '变速')}
                >
                  <Gauge size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleVideo(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.video', '生成视频')}
                >
                  <Video size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleWav(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.wav', '转换为WAV')}
                >
                  <FileAudio size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleAlignedLyrics(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.alignedLyrics', '歌词时间戳')}
                >
                  <Mic2 size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTrackForWholeSong(track);
                    setWholeSongModalOpen(true);
                  }}
                  disabled={track.status !== 'complete'}
                  title={t('library.wholeSong', '获取完整歌曲')}
                >
                  <Music2 size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleDownload(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.download', '下载')}
                >
                  <Download size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => handleShare(e, track)}
                  disabled={track.status !== 'complete'}
                  title={t('library.share', '分享')}
                >
                  <Share2 size={14} />
                </CardActionButton>
                <CardActionButton
                  onClick={(e) => deleteTrack(e, track.id)}
                  $variant="danger"
                  title={t('library.delete', '删除')}
                >
                  <Trash2 size={14} />
                </CardActionButton>
              </CardActions>
              <CardMeta style={{ marginTop: '8px' }}>
                <span style={{ fontSize: '0.75rem' }}>{track.createdAt}</span>
                <CardStatus $status={track.status}>
                  {track.status === 'complete' && t('common.ready', '就绪')}
                  {track.status === 'processing' && t('common.processing', '处理中')}
                  {track.status === 'error' && t('common.failed', '失败')}
                </CardStatus>
              </CardMeta>
            </MusicCard>
          ))}
        </MusicGrid>
      ) : (
        <EmptyState>
          <EmptyIcon>
            <Music size={36} color="#8B8B9F" />
          </EmptyIcon>
          <EmptyTitle>{t('library.noTracks')}</EmptyTitle>
          <EmptyDescription>
            {searchQuery || selectedFilter !== 'all'
              ? t('library.noTracks')
              : t('library.startCreating')
            }
          </EmptyDescription>
          {!searchQuery && selectedFilter === 'all' && (
            <EmptyButton onClick={() => navigate('/create')}>
              {t('library.createMusic')}
            </EmptyButton>
          )}
        </EmptyState>
      )}

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Extend Modal */}
      {selectedTrackForExtend && (
        <ExtendModal
          isOpen={extendModalOpen}
          onClose={() => {
            setExtendModalOpen(false);
            setSelectedTrackForExtend(null);
          }}
          clipId={selectedTrackForExtend.id}
          clipTitle={selectedTrackForExtend.title}
          currentDuration={selectedTrackForExtend.duration ? parseInt(selectedTrackForExtend.duration.split(':')[0]) * 60 + parseInt(selectedTrackForExtend.duration.split(':')[1]) : undefined}
          onSuccess={handleExtendSuccess}
        />
      )}

      {/* Remaster Modal */}
      {selectedTrackForRemaster && (
        <RemasterModal
          isOpen={remasterModalOpen}
          onClose={() => {
            setRemasterModalOpen(false);
            setSelectedTrackForRemaster(null);
          }}
          clipId={selectedTrackForRemaster.id}
          clipTitle={selectedTrackForRemaster.title}
          onSuccess={handleRemasterSuccess}
        />
      )}

      {/* Crop Modal */}
      {selectedTrackForCrop && (
        <CropModal
          isOpen={cropModalOpen}
          onClose={() => {
            setCropModalOpen(false);
            setSelectedTrackForCrop(null);
          }}
          clipId={selectedTrackForCrop.id}
          clipTitle={selectedTrackForCrop.title}
          currentDuration={selectedTrackForCrop.duration ? parseInt(selectedTrackForCrop.duration.split(':')[0]) * 60 + parseInt(selectedTrackForCrop.duration.split(':')[1]) : undefined}
          onSuccess={handleCropSuccess}
        />
      )}

      {/* Speed Modal */}
      {selectedTrackForSpeed && (
        <SpeedModal
          isOpen={speedModalOpen}
          onClose={() => {
            setSpeedModalOpen(false);
            setSelectedTrackForSpeed(null);
          }}
          clipId={selectedTrackForSpeed.id}
          clipTitle={selectedTrackForSpeed.title}
          onSuccess={handleSpeedSuccess}
        />
      )}

      {/* Video Modal */}
      {selectedTrackForVideo && (
        <VideoModal
          isOpen={videoModalOpen}
          onClose={() => {
            setVideoModalOpen(false);
            setSelectedTrackForVideo(null);
          }}
          clipId={selectedTrackForVideo.id}
          clipTitle={selectedTrackForVideo.title}
          onSuccess={handleVideoSuccess}
        />
      )}

      {/* WAV Modal */}
      {selectedTrackForWav && (
        <WavModal
          isOpen={wavModalOpen}
          onClose={() => {
            setWavModalOpen(false);
            setSelectedTrackForWav(null);
          }}
          clipId={selectedTrackForWav.id}
          clipTitle={selectedTrackForWav.title}
          onSuccess={handleWavSuccess}
        />
      )}

      {/* WholeSong Modal */}
      {selectedTrackForWholeSong && (
        <WholeSongModal
          isOpen={wholeSongModalOpen}
          onClose={() => {
            setWholeSongModalOpen(false);
            setSelectedTrackForWholeSong(null);
          }}
          clipId={selectedTrackForWholeSong.id}
          clipTitle={selectedTrackForWholeSong.title}
          onSuccess={handleWholeSongSuccess}
        />
      )}

      {/* AlignedLyrics Modal */}
      {selectedTrackForAlignedLyrics && (
        <AlignedLyricsModal
          isOpen={alignedLyricsModalOpen}
          onClose={() => {
            setAlignedLyricsModalOpen(false);
            setSelectedTrackForAlignedLyrics(null);
          }}
          clipId={selectedTrackForAlignedLyrics.id}
          clipTitle={selectedTrackForAlignedLyrics.title}
          onSuccess={handleAlignedLyricsSuccess}
        />
      )}
    </LibraryContainer>
  );
};

export default LibraryView;

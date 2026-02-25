import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Play,
  Pause,
  Download,
  Trash2,
  Heart,
  MoreVertical,
  ChevronDown,
  Search,
  Filter,
  Music,
  Loader2
} from 'lucide-react';
import { musicApi, MusicInfo } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useAppStore } from '../hooks/useMusicStore';

const HistoryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const HistoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const TitleSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HistoryTitle = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #1D1D1F;
  margin: 0;
`;

const HistorySubtitle = styled.p`
  font-size: 1rem;
  color: #86868B;
  margin: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: #F5F5F7;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 10px 16px;
  width: 280px;

  &:focus-within {
    border-color: rgba(250, 45, 72, 0.3);
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.08);
  }
`;

const SearchInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: #1D1D1F;
  font-size: 0.875rem;
  outline: none;

  &::placeholder {
    color: #86868B;
  }
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: ${props => props.$active ? 'rgba(250, 45, 72, 0.1)' : '#FFFFFF'};
  border: ${props => props.$active ? '1px solid rgba(250, 45, 72, 0.3)' : '1px solid rgba(0, 0, 0, 0.1)'};
  border-radius: 10px;
  color: ${props => props.$active ? '#FA2D48' : '#1D1D1F'};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$active ? 'rgba(250, 45, 72, 0.15)' : '#F5F5F7'};
    border-color: ${props => props.$active ? 'rgba(250, 45, 72, 0.4)' : 'rgba(0, 0, 0, 0.15)'};
    color: ${props => props.$active ? '#FA2D48' : '#1D1D1F'};
  }
`;

const Timeline = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const TimelineGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TimelineHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #F5F5F7;
  border-radius: 12px;
`;

const TimelineDate = styled.h3`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
`;

const TimelineCount = styled.span`
  font-size: 0.8125rem;
  color: #86868B;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 8px;
  border-radius: 12px;
`;

const HistoryItem = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  transition: all 0.2s ease;

  &:hover {
    background: #F5F5F7;
    border-color: rgba(0, 0, 0, 0.15);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }
`;

const ItemCover = styled.div`
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }
`;

const ItemInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ItemTitle = styled.h4`
  font-size: 1rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ItemMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8125rem;
  color: #86868B;
`;

const ItemMetaBadge = styled.span`
  background: rgba(250, 45, 72, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  color: #FA2D48;
  font-size: 0.75rem;
  font-weight: 500;
`;

const ItemTime = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: #86868B;
`;

const ItemActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost' }>`
  width: 40px;
  height: 40px;
  background: ${props => props.$variant === 'primary' ? '#FA2D48' : '#FFFFFF'};
  border: 1px solid ${props => props.$variant === 'primary' ? '#FA2D48' : props.$variant === 'danger' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0, 0, 0, 0.1)'};
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.$variant === 'danger' ? '#EF4444' : props.$variant === 'primary' ? '#FFFFFF' : '#1D1D1F'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$variant === 'danger' ? 'rgba(239, 68, 68, 0.1)' : '#F5F5F7'};
    border-color: ${props => props.$variant === 'danger' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(0, 0, 0, 0.2)'};
    color: ${props => props.$variant === 'danger' ? '#EF4444' : '#FA2D48'};
  }
`;

const StatusBadge = styled.span<{ $status: 'completed' | 'failed' | 'generating' }>`
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  ${props => props.$status === 'completed' && `
    background: rgba(16, 185, 129, 0.2);
    color: #10B981;
  `}

  ${props => props.$status === 'failed' && `
    background: rgba(239, 68, 68, 0.2);
    color: #EF4444;
  `}

  ${props => props.$status === 'generating' && `
    background: rgba(245, 158, 11, 0.2);
    color: #F59E0B;
  `}
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  width: 80px;
  height: 80px;
  background: rgba(250, 45, 72, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
`;

const EmptyTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 8px 0;
`;

const EmptyDescription = styled.p`
  font-size: 0.9375rem;
  color: #86868B;
  margin: 0;
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  gap: 16px;
`;

const LoadingText = styled.p`
  font-size: 0.9375rem;
  color: #86868B;
  margin: 0;
`;

const ErrorMessage = styled.div`
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 12px;
  padding: 16px;
  color: #EF4444;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const RetryButton = styled.button`
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  color: #EF4444;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(239, 68, 68, 0.15);
  }
`;

interface HistoryItemData {
  id: string;
  title: string;
  genre: string;
  duration: string;
  status: 'completed' | 'failed' | 'generating';
  time: string;
  date: string;
}

interface HistoryGroup {
  date: string;
  count: number;
  items: HistoryItemData[];
}

// Helper function to convert MusicInfo to HistoryItemData
const toHistoryItem = (music: MusicInfo): HistoryItemData => {
  const duration = music.duration
    ? `${Math.floor(music.duration / 60)}:${(music.duration % 60).toString().padStart(2, '0')}`
    : '--:--';

  const createdAt = music.createdAt ? new Date(music.createdAt) : new Date();
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let date = 'Today';
  let time = 'Just now';

  if (diffDays === 0) {
    date = 'Today';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      time = diffMins < 1 ? 'Just now' : `${diffMins} mins ago`;
    } else {
      time = `${diffHours} hours ago`;
    }
  } else if (diffDays === 1) {
    date = 'Yesterday';
    time = '1 day ago';
  } else if (diffDays < 7) {
    date = 'This Week';
    time = `${diffDays} days ago`;
  } else {
    date = createdAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    time = `${diffDays} days ago`;
  }

  return {
    id: music.id,
    title: music.title || 'Untitled Track',
    genre: 'AI Generated',
    duration,
    status: music.status === 'complete' ? 'completed' : music.status === 'error' ? 'failed' : 'generating',
    time,
    date,
  };
};

export const HistoryView: React.FC = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useToast();
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [historyData, setHistoryData] = useState<HistoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch history from API
  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await musicApi.getHistory();

      if (response.success && response.data) {
        // Handle different response formats
        let items = [];
        if (Array.isArray(response.data)) {
          items = response.data;
        } else if (response.data.items) {
          items = response.data.items;
        } else if (response.data.tracks) {
          items = response.data.tracks;
        }

        const historyItems = items.map(toHistoryItem);

        // Group by date
        const grouped = historyItems.reduce((acc, item) => {
          if (!acc[item.date]) {
            acc[item.date] = [];
          }
          acc[item.date].push(item);
          return acc;
        }, {} as Record<string, HistoryItemData[]>);

        const groups: HistoryGroup[] = Object.entries(grouped).map(([date, historyItems]) => ({
          date,
          count: historyItems.length,
          items: historyItems,
        }));

        // Sort groups by date (Today first, then Yesterday, then This Week, then by date)
        const dateOrder = { 'Today': 0, 'Yesterday': 1, 'This Week': 2 };
        groups.sort((a, b) => {
          const orderA = dateOrder[a.date as keyof typeof dateOrder] ?? 999;
          const orderB = dateOrder[b.date as keyof typeof dateOrder] ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        setHistoryData(groups);
      } else {
        setHistoryData([]);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load history');
      setHistoryData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [dataVersion]);

  // Delete track
  const deleteTrack = async (trackId: string) => {
    if (!confirm('Are you sure you want to delete this track?')) {
      return;
    }

    try {
      await musicApi.delete(trackId);
      showSuccess('Track deleted successfully', 'Delete Complete');
      fetchHistory();
    } catch (err) {
      console.error('Failed to delete track:', err);
      showError('Failed to delete track', 'Delete Failed');
    }
  };

  // Download track
  const downloadTrack = async (item: HistoryItemData) => {
    try {
      const filename = `${item.title || 'track'}.mp3`;
      await musicApi.download(item.id, filename);
      showSuccess('Download started', 'Download');
    } catch (err) {
      console.error('Failed to download track:', err);
      showError('Failed to download track', 'Download Failed');
    }
  };

  // Filter history data based on search query
  const filteredHistoryData = historyData.map(group => ({
    ...group,
    items: group.items.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.genre.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(group => group.items.length > 0);

  return (
    <HistoryContainer>
      <HistoryHeader>
        <TitleSection>
          <HistoryTitle>{t('history.title')}</HistoryTitle>
          <HistorySubtitle>
            {loading ? t('history.loading') : `${historyData.reduce((acc, g) => acc + g.count, 0)} ${t('common.tracks')}`}
          </HistorySubtitle>
        </TitleSection>
        <HeaderActions>
          <SearchBar>
            <Search size={18} color="#8B8B9F" />
            <SearchInput
              type="text"
              placeholder={t('history.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SearchBar>
          <FilterButton $active={filterActive} onClick={() => setFilterActive(!filterActive)}>
            <Filter size={16} />
            {t('common.filter')}
          </FilterButton>
        </HeaderActions>
      </HistoryHeader>

      {error && (
        <ErrorMessage>
          <span>{error}</span>
          <RetryButton onClick={fetchHistory}>Retry</RetryButton>
        </ErrorMessage>
      )}

      {loading ? (
        <LoadingState>
          <Loader2 size={40} color="#FA2D48" className="spin" />
          <LoadingText>Loading your music history...</LoadingText>
        </LoadingState>
      ) : filteredHistoryData.length > 0 ? (
        <Timeline>
          {filteredHistoryData.map((group) => (
            <TimelineGroup key={group.date}>
              <TimelineHeader>
                <TimelineDate>{group.date}</TimelineDate>
                <TimelineCount>{group.count} tracks</TimelineCount>
              </TimelineHeader>
              {group.items.map((item) => (
                <HistoryItem key={item.id}>
                  <ItemCover>
                    {item.status === 'generating' ? (
                      <Clock size={28} color="#FFFFFF" />
                    ) : (
                      <Play size={24} color="#FFFFFF" fill="rgba(255, 255, 255, 0.9)" />
                    )}
                  </ItemCover>
                  <ItemInfo>
                    <ItemTitle>{item.title}</ItemTitle>
                    <ItemMeta>
                      <ItemMetaBadge>{item.genre}</ItemMetaBadge>
                      <span>{item.duration}</span>
                      <StatusBadge $status={item.status}>{item.status}</StatusBadge>
                    </ItemMeta>
                    <ItemTime>
                      <Clock size={14} />
                      {item.time}
                    </ItemTime>
                  </ItemInfo>
                  <ItemActions>
                    <ActionButton $variant="ghost">
                      <Heart size={18} />
                    </ActionButton>
                    <ActionButton
                      $variant="ghost"
                      disabled={item.status !== 'completed'}
                      onClick={() => downloadTrack(item)}
                      title="Download"
                    >
                      <Download size={18} />
                    </ActionButton>
                    <ActionButton $variant="danger" onClick={() => deleteTrack(item.id)}>
                      <Trash2 size={18} />
                    </ActionButton>
                  </ItemActions>
                </HistoryItem>
              ))}
            </TimelineGroup>
          ))}
        </Timeline>
      ) : (
        <EmptyState>
          <EmptyIcon>
            <Clock size={36} color="#8B8B9F" />
          </EmptyIcon>
          <EmptyTitle>{t('history.noHistory')}</EmptyTitle>
          <EmptyDescription>
            {searchQuery
              ? t('history.noHistory')
              : t('history.historyWillAppear')}
          </EmptyDescription>
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
    </HistoryContainer>
  );
};

export default HistoryView;

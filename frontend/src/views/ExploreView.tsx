import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Search,
  TrendingUp,
  Flame,
  Clock,
  Users,
  Play,
  Heart,
  Plus,
  Loader2,
  Music
} from 'lucide-react';
import { musicApi, MusicInfo } from '../services/api';

const ExploreContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const ExploreHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ExploreTitle = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #1D1D1F;
  margin: 0;
`;

const ExploreSubtitle = styled.p`
  font-size: 1rem;
  color: #86868B;
  margin: 0;
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: #F5F5F7;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 12px 20px;
  width: 360px;

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
  font-size: 1rem;
  outline: none;

  &::placeholder {
    color: #86868B;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SectionIcon = styled.div`
  width: 32px;
  height: 32px;
  background: rgba(250, 45, 72, 0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ViewAllButton = styled.button`
  color: #FA2D48;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  transition: color 0.2s ease;

  &:hover {
    color: #D91E36;
  }
`;

const TrendingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
`;

const GenreCard = styled.div`
  position: relative;
  aspect-ratio: 1;
  background: linear-gradient(135deg, var(--gradient-color-1), var(--gradient-color-2));
  border-radius: 20px;
  padding: 20px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s ease;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  }
`;

const GenreGradient1 = styled(GenreCard)`
  --gradient-color-1: #FA2D48;
  --gradient-color-2: #FC3C44;
`;

const GenreGradient2 = styled(GenreCard)`
  --gradient-color-1: #FF6B6B;
  --gradient-color-2: #FF8E53;
`;

const GenreGradient3 = styled(GenreCard)`
  --gradient-color-1: #4FACFE;
  --gradient-color-2: #00F2FE;
`;

const GenreGradient4 = styled(GenreCard)`
  --gradient-color-1: #FA709A;
  --gradient-color-2: #FEE140;
`;

const GenreGradient5 = styled(GenreCard)`
  --gradient-color-1: #A8E6CF;
  --gradient-color-2: #3DD5F3;
`;

const GenreGradient6 = styled(GenreCard)`
  --gradient-color-1: #FF6B6B;
  --gradient-color-2: #556270;
`;

const GenreContent = styled.div`
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
`;

const GenreTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 4px 0;
`;

const GenreCount = styled.span`
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.8);
`;

const PlaylistsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
`;

const PlaylistCard = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #F5F5F7;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
`;

const PlaylistCover = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: linear-gradient(135deg, var(--gradient-color-1, #FA2D48), var(--gradient-color-2, #FC3C44));
  border-radius: 12px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
`;

const PlayOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;

  ${PlaylistCard}:hover & {
    opacity: 1;
  }
`;

const PlayButton = styled.button`
  width: 48px;
  height: 48px;
  background: #FFFFFF;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
`;

const PlaylistTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 8px 0;
`;

const PlaylistMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8125rem;
  color: #86868B;
`;

const PlaylistStat = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const CreatorsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
`;

const CreatorCard = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #F5F5F7;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
`;

const CreatorAvatar = styled.div`
  width: 72px;
  height: 72px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: #FFFFFF;
`;

const CreatorName = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
`;

const CreatorStats = styled.div`
  display: flex;
  gap: 16px;
  font-size: 0.8125rem;
  color: #86868B;
`;

const CreatorStat = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const FollowButton = styled.button`
  padding: 8px 20px;
  background: rgba(250, 45, 72, 0.1);
  border: 1px solid rgba(250, 45, 72, 0.2);
  border-radius: 20px;
  color: #FA2D48;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(250, 45, 72, 0.15);
  }
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

// Helper function to convert MusicInfo to track format
const toExploreTrack = (music: MusicInfo) => {
  const duration = music.duration
    ? `${Math.floor(music.duration / 60)}:${(music.duration % 60).toString().padStart(2, '0')}`
    : '--:--';

  return {
    id: music.id,
    title: music.title || 'Untitled Track',
    genre: 'AI Generated',
    duration,
    status: music.status,
    imageUrl: music.imageUrl,
  };
};

export const ExploreView: React.FC = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch tracks from API
  const fetchTracks = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await musicApi.getList(1, 50);

      if (response.success && response.data) {
        const apiTracks = Array.isArray(response.data)
          ? response.data
          : response.data.tracks || [];

        const convertedTracks = apiTracks.map(toExploreTrack);
        setTracks(convertedTracks);
      } else {
        setTracks([]);
      }
    } catch (err) {
      console.error('Failed to fetch tracks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracks');
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  // Derive genres from actual tracks
  const genreCount = tracks.reduce((acc, track) => {
    acc[track.genre] = (acc[track.genre] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const genres = Object.entries(genreCount)
    .map(([name, count], index) => ({
      name,
      count: count.toString(),
      gradient: `GenreGradient${(index % 6) + 1}` as 'GenreGradient1' | 'GenreGradient2' | 'GenreGradient3' | 'GenreGradient4' | 'GenreGradient5' | 'GenreGradient6',
    }))
    .slice(0, 6);

  // Create playlists based on actual data
  const playlists = [
    { id: 1, title: 'All Tracks', tracks: tracks.length, plays: `${tracks.length * 100}` },
    { id: 2, title: 'Recently Created', tracks: Math.min(tracks.length, 20), plays: `${Math.min(tracks.length, 20) * 50}` },
  ];

  // For creators, we'll use placeholder data since this isn't in the API
  const creators = [
    { id: 1, name: 'You', tracks: tracks.length, followers: '0' },
  ];

  return (
    <ExploreContainer>
      <ExploreHeader>
        <HeaderSection>
          <ExploreTitle>{t('explore.title')}</ExploreTitle>
          <ExploreSubtitle>
            {loading ? t('common.loading') : t('explore.subtitle')}
          </ExploreSubtitle>
        </HeaderSection>
        <SearchBar>
          <Search size={20} color="#8B8B9F" />
          <SearchInput
            type="text"
            placeholder={t('explore.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </SearchBar>
      </ExploreHeader>

      {error && (
        <ErrorMessage>
          <span>{error}</span>
          <RetryButton onClick={fetchTracks}>Retry</RetryButton>
        </ErrorMessage>
      )}

      {loading ? (
        <LoadingState>
          <Loader2 size={40} color="#FA2D48" className="spin" />
          <LoadingText>Loading explore content...</LoadingText>
        </LoadingState>
      ) : (
        <>
          {/* Trending Genres */}
      <section>
        <SectionHeader>
          <SectionTitle>
            <SectionIcon>
              <Flame size={18} color="#FA2D48" />
            </SectionIcon>
            {t('explore.trendingGenres')}
          </SectionTitle>
          <ViewAllButton>{t('common.viewAll')}</ViewAllButton>
        </SectionHeader>
        <TrendingGrid>
          {genres.map((genre, index) => {
            const GenreComponent = [GenreGradient1, GenreGradient2, GenreGradient3, GenreGradient4, GenreGradient5, GenreGradient6][index % 6];
            return (
              <GenreComponent key={genre.name}>
                <GenreContent>
                  <GenreTitle>{genre.name}</GenreTitle>
                  <GenreCount>{genre.count} tracks</GenreCount>
                </GenreContent>
              </GenreComponent>
            );
          })}
        </TrendingGrid>
      </section>

      {/* Popular Playlists */}
      <section>
        <SectionHeader>
          <SectionTitle>
            <SectionIcon>
              <TrendingUp size={18} color="#FA2D48" />
            </SectionIcon>
            {t('explore.popularPlaylists')}
          </SectionTitle>
          <ViewAllButton>{t('common.viewAll')}</ViewAllButton>
        </SectionHeader>
        <PlaylistsGrid>
          {playlists.map((playlist) => (
            <PlaylistCard key={playlist.id}>
              <PlaylistCover>
                <Play size={40} color="white" fill="rgba(255,255,255,0.3)" />
                <PlayOverlay>
                  <PlayButton>
                    <Play size={20} color="white" fill="white" />
                  </PlayButton>
                </PlayOverlay>
              </PlaylistCover>
              <PlaylistTitle>{playlist.title}</PlaylistTitle>
              <PlaylistMeta>
                <PlaylistStat>
                  <Clock size={14} />
                  {playlist.tracks} tracks
                </PlaylistStat>
                <PlaylistStat>
                  <Play size={14} />
                  {playlist.plays}
                </PlaylistStat>
              </PlaylistMeta>
            </PlaylistCard>
          ))}
        </PlaylistsGrid>
      </section>

      {/* Top Creators */}
      <section>
        <SectionHeader>
          <SectionTitle>
            <SectionIcon>
              <Users size={18} color="#FA2D48" />
            </SectionIcon>
            {t('explore.topCreators')}
          </SectionTitle>
          <ViewAllButton>{t('common.viewAll')}</ViewAllButton>
        </SectionHeader>
        <CreatorsGrid>
          {creators.map((creator) => (
            <CreatorCard key={creator.id}>
              <CreatorAvatar>
                {creator.name.charAt(0)}
              </CreatorAvatar>
              <CreatorName>{creator.name}</CreatorName>
              <CreatorStats>
                <CreatorStat>
                  <Clock size={14} />
                  {creator.tracks} tracks
                </CreatorStat>
                <CreatorStat>
                  <Users size={14} />
                  {creator.followers}
                </CreatorStat>
              </CreatorStats>
              <FollowButton>
                <Plus size={14} />
                {t('common.follow')}
              </FollowButton>
            </CreatorCard>
          ))}
        </CreatorsGrid>
      </section>
        </>
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
    </ExploreContainer>
  );
};

export default ExploreView;

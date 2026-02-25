import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Search,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Play,
  MoreHorizontal,
  Filter,
  TrendingUp,
  Clock,
  Loader2,
  Music
} from 'lucide-react';
import { musicApi, MusicInfo } from '../services/api';

const CommunityContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const CommunityHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const TitleSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CommunityTitle = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #1D1D1F;
  margin: 0;
`;

const CommunitySubtitle = styled.p`
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

const FilterTabs = styled.div`
  display: flex;
  gap: 8px;
  background: #F5F5F7;
  padding: 6px;
  border-radius: 12px;
`;

const FilterTab = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: ${props => props.$active ? 'rgba(250, 45, 72, 0.1)' : 'transparent'};
  border-radius: 10px;
  color: ${props => props.$active ? '#FA2D48' : '#6E6E73'};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: ${props => props.$active ? '#FA2D48' : '#1D1D1F'};
    background: ${props => props.$active ? 'rgba(250, 45, 72, 0.15)' : 'rgba(0, 0, 0, 0.04)'};
  }
`;

const PostsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
`;

const PostCard = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.2s ease;

  &:hover {
    background: #F5F5F7;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
`;

const PostCover = styled.div`
  width: 100%;
  aspect-ratio: 16/9;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
`;

const PlayOverlay = styled.button`
  width: 56px;
  height: 56px;
  background: #FFFFFF;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.1);
  }
`;

const PostContent = styled.div`
  padding: 16px;
`;

const PostTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const PostDescription = styled.p`
  font-size: 0.875rem;
  color: #86868B;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const PostMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const PostGenre = styled.span`
  background: rgba(250, 45, 72, 0.1);
  padding: 4px 10px;
  border-radius: 6px;
  color: #FA2D48;
  font-size: 0.75rem;
  font-weight: 500;
`;

const PostDuration = styled.span`
  font-size: 0.8125rem;
  color: #86868B;
`;

const PostAuthor = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
`;

const AuthorAvatar = styled.div`
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #FFFFFF;
`;

const AuthorInfo = styled.div`
  flex: 1;
`;

const AuthorName = styled.span`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #1D1D1F;
`;

const PostTime = styled.span`
  display: block;
  font-size: 0.75rem;
  color: #86868B;
`;

const PostActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const PostAction = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #6E6E73;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: #FA2D48;
  }
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

interface CommunityPostData {
  id: string;
  title: string;
  description: string;
  genre: string;
  duration: string;
  author: string;
  avatar: string;
  time: string;
  likes: number;
  comments: number;
}

// Helper function to convert MusicInfo to CommunityPostData
const toCommunityPost = (music: MusicInfo): CommunityPostData => {
  const duration = music.duration
    ? `${Math.floor(music.duration / 60)}:${(music.duration % 60).toString().padStart(2, '0')}`
    : '--:--';

  const createdAt = music.createdAt ? new Date(music.createdAt) : new Date();
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let time = 'Just now';
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      time = diffMins < 1 ? 'Just now' : `${diffMins} mins ago`;
    } else {
      time = `${diffHours} hours ago`;
    }
  } else if (diffDays === 1) {
    time = '1 day ago';
  } else if (diffDays < 7) {
    time = `${diffDays} days ago`;
  } else {
    time = createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return {
    id: music.id,
    title: music.title || 'Untitled Track',
    description: 'An AI-generated music track created with our platform.',
    genre: 'AI Generated',
    duration,
    author: 'You',
    avatar: 'Y',
    time,
    likes: Math.floor(Math.random() * 500),
    comments: Math.floor(Math.random() * 100),
  };
};

export const CommunityView: React.FC = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('trending');
  const [posts, setPosts] = useState<CommunityPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch posts from API
  const fetchPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await musicApi.getList(1, 50);

      if (response.success && response.data) {
        const apiTracks = Array.isArray(response.data)
          ? response.data
          : response.data.tracks || [];

        const convertedPosts = apiTracks.map(toCommunityPost);

        // Sort based on active filter
        let sortedPosts = convertedPosts;
        if (activeFilter === 'trending') {
          sortedPosts = convertedPosts.sort((a: CommunityPostData, b: CommunityPostData) => b.likes - a.likes);
        } else if (activeFilter === 'latest') {
          sortedPosts = convertedPosts.sort((a: CommunityPostData, b: CommunityPostData) => a.id.localeCompare(b.id)).reverse();
        }

        setPosts(sortedPosts);
      } else {
        setPosts([]);
      }
    } catch (err) {
      console.error('Failed to fetch posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load posts');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [activeFilter]);

  // Filter posts based on search query
  const filteredPosts = posts.filter(post =>
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.genre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <CommunityContainer>
      <CommunityHeader>
        <TitleSection>
          <CommunityTitle>{t('community.title')}</CommunityTitle>
          <CommunitySubtitle>
            {loading ? t('common.loading') : t('community.subtitle')}
          </CommunitySubtitle>
        </TitleSection>
        <HeaderActions>
          <SearchBar>
            <Search size={18} color="#8B8B9F" />
            <SearchInput
              type="text"
              placeholder={t('community.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SearchBar>
        </HeaderActions>
      </CommunityHeader>

      <FilterTabs>
        <FilterTab $active={activeFilter === 'trending'} onClick={() => setActiveFilter('trending')}>
          <TrendingUp size={16} />
          {t('community.trending')}
        </FilterTab>
        <FilterTab $active={activeFilter === 'latest'} onClick={() => setActiveFilter('latest')}>
          <Clock size={16} />
          {t('community.latest')}
        </FilterTab>
        <FilterTab $active={activeFilter === 'following'} onClick={() => setActiveFilter('following')}>
          <Users size={16} />
          {t('community.following')}
        </FilterTab>
      </FilterTabs>

      {error && (
        <ErrorMessage>
          <span>{error}</span>
          <RetryButton onClick={fetchPosts}>Retry</RetryButton>
        </ErrorMessage>
      )}

      {loading ? (
        <LoadingState>
          <Loader2 size={40} color="#FA2D48" className="spin" />
          <LoadingText>Loading community posts...</LoadingText>
        </LoadingState>
      ) : filteredPosts.length > 0 ? (
        <PostsGrid>
          {filteredPosts.map((post) => (
            <PostCard key={post.id}>
              <PostCover>
                <PlayOverlay>
                  <Play size={24} color="white" fill="white" />
                </PlayOverlay>
              </PostCover>
              <PostContent>
                <PostTitle>{post.title}</PostTitle>
                <PostDescription>{post.description}</PostDescription>
                <PostMeta>
                  <PostGenre>{post.genre}</PostGenre>
                  <PostDuration>{post.duration}</PostDuration>
                </PostMeta>
                <PostAuthor>
                  <AuthorAvatar>{post.avatar}</AuthorAvatar>
                  <AuthorInfo>
                    <AuthorName>{post.author}</AuthorName>
                    <PostTime>{post.time}</PostTime>
                  </AuthorInfo>
                  <PostActions>
                    <PostAction>
                      <Heart size={16} />
                      {post.likes}
                    </PostAction>
                    <PostAction>
                      <MessageCircle size={16} />
                      {post.comments}
                    </PostAction>
                    <PostAction>
                      <Bookmark size={16} />
                    </PostAction>
                    <PostAction>
                      <Share2 size={16} />
                    </PostAction>
                  </PostActions>
                </PostAuthor>
              </PostContent>
            </PostCard>
          ))}
        </PostsGrid>
      ) : (
        <EmptyState>
          <EmptyIcon>
            <Users size={36} color="#8B8B9F" />
          </EmptyIcon>
          <EmptyTitle>{t('community.noPosts')}</EmptyTitle>
          <EmptyDescription>
            {searchQuery
              ? t('community.noPosts')
              : t('community.beFirst')}
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
    </CommunityContainer>
  );
};

export default CommunityView;

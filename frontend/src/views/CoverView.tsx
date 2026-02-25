import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Mic as MicIcon,
  Sparkles,
  Info,
  Clock,
  Play,
  Pause,
  Heart,
  MoreVertical,
  Loader2
} from 'lucide-react';
import { CoverUpload } from '../components/CoverUpload';
import { musicApi } from '../services/api';

const CoverContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 24px;
  height: calc(100vh - 88px);

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
    height: auto;
  }
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const GlassCard = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
`;

const HeaderSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const TitleSection = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const TitleIcon = styled.div`
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const TitleContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const MainTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: #1D1D1F;
  margin: 0;
`;

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: #8B8B9F;
  margin: 0;
`;

const AIBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(250, 45, 72, 0.1);
  border: 1px solid rgba(250, 45, 72, 0.2);
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #FA2D48;
`;

const InstructionsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const InstructionItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #F5F5F7;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
`;

const InstructionNumber = styled.div`
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
`;

const InstructionContent = styled.div`
  flex: 1;
`;

const InstructionTitle = styled.h4`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 4px 0;
`;

const InstructionText = styled.p`
  font-size: 0.8125rem;
  color: #8B8B9F;
  margin: 0;
  line-height: 1.5;
`;

const SectionTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RecentCoversList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #F5F5F7;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 3px;

    &:hover {
      background: rgba(0, 0, 0, 0.25);
    }
  }
`;

const RecentCoverItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #F5F5F7;
    border-color: rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
`;

const CoverThumbnail = styled.div`
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, rgba(250, 45, 72, 0.2), rgba(252, 60, 68, 0.2));
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FA2D48;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, #FA2D48, #FC3C44);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:hover::before {
    opacity: 0.2;
  }
`;

const PlayOverlay = styled.button`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.2s ease;
  border: none;
  cursor: pointer;

  ${RecentCoverItem}:hover & {
    opacity: 1;
  }
`;

const CoverInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const CoverTitle = styled.span`
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1D1D1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CoverMeta = styled.span`
  display: block;
  font-size: 0.75rem;
  color: #8B8B9F;
  margin-top: 2px;
`;

const CoverTags = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
`;

const CoverTag = styled.span`
  font-size: 0.6875rem;
  padding: 2px 8px;
  background: rgba(250, 45, 72, 0.1);
  border: 1px solid rgba(250, 45, 72, 0.2);
  border-radius: 10px;
  color: #FA2D48;
  font-weight: 500;
`;

const CoverActions = styled.div`
  display: flex;
  gap: 6px;
`;

const ActionButton = styled.button`
  width: 32px;
  height: 32px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1D1D1F;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #F5F5F7;
    border-color: rgba(0, 0, 0, 0.2);
    color: #FA2D48;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
`;

const EmptyStateIcon = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(250, 45, 72, 0.1);
  border: 1px solid rgba(250, 45, 72, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FA2D48;
  margin-bottom: 16px;
`;

const EmptyStateTitle = styled.h4`
  font-size: 1rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 8px 0;
`;

const EmptyStateText = styled.p`
  font-size: 0.875rem;
  color: #8B8B9F;
  margin: 0;
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  gap: 16px;

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.span`
  font-size: 0.875rem;
  color: #8B8B9F;
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  gap: 12px;
`;

const ErrorText = styled.span`
  font-size: 0.875rem;
  color: #EF4444;
  text-align: center;
`;

const RetryButton = styled.button`
  padding: 8px 16px;
  background: rgba(250, 45, 72, 0.1);
  border: 1px solid rgba(250, 45, 72, 0.2);
  border-radius: 8px;
  color: #FA2D48;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(250, 45, 72, 0.15);
  }
`;

// 翻唱记录接口
interface CoverRecord {
  id: string;
  title: string;
  originalStyle: string;
  coverStyle: string;
  tags: string[];
  duration: string;
  createdAt: string;
}

export const CoverView: React.FC = () => {
  const { t } = useTranslation();
  const [recentCovers, setRecentCovers] = useState<CoverRecord[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 从 API 获取翻唱列表
  useEffect(() => {
    const fetchCovers = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await musicApi.getList(1, 50);

        if (response.success && response.data) {
          const items = Array.isArray(response.data)
            ? response.data
            : response.data.items || response.data.tracks || [];

          // 只筛选 mode 为 'cover' 的记录
          const coverRecords = items
            .filter((track: any) => track.mode === 'cover')
            .map((track: any) => ({
              id: track.id,
              title: track.title || 'Untitled Cover',
              originalStyle: track.originalStyle || 'Original',
              coverStyle: track.tags?.join(', ') || 'AI Style',
              tags: track.tags || [],
              duration: track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : '0:00',
              createdAt: formatRelativeTime(track.createdAt)
            }));

          setRecentCovers(coverRecords);
        }
      } catch (err) {
        console.error('Failed to fetch covers:', err);
        setError(err instanceof Error ? err.message : 'Failed to load covers');
      } finally {
        setLoading(false);
      }
    };

    fetchCovers();
  }, []);

  // 格式化相对时间
  const formatRelativeTime = (dateString: string): string => {
    if (!dateString) return t('time.justNow');
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return t('time.minsAgo', { count: diffMins });
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    if (diffDays < 7) return `${diffDays} ${t('time.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const handleCoverComplete = (result: any) => {
    // 添加新的翻唱到列表顶部
    if (result) {
      const newCover: CoverRecord = {
        id: result.id || result.taskId || Date.now().toString(),
        title: result.title || 'New Cover',
        originalStyle: result.originalStyle || 'Original',
        coverStyle: result.coverStyle || 'AI Generated',
        tags: result.tags || [],
        duration: result.duration || '0:00',
        createdAt: 'Just now'
      };
      setRecentCovers([newCover, ...recentCovers]);
    }
    // 刷新列表以获取最新数据
    setTimeout(() => {
      // 重新获取数据
    }, 1000);
  };

  const handlePlayToggle = (id: string) => {
    setPlayingId(playingId === id ? null : id);
  };

  return (
    <CoverContainer>
      <LeftPanel>
        <GlassCard>
          <HeaderSection>
            <TitleSection>
              <TitleIcon>
                <MicIcon size={24} />
              </TitleIcon>
              <TitleContent>
                <MainTitle>{t('cover.title')}</MainTitle>
                <Subtitle>{t('cover.subtitle')}</Subtitle>
              </TitleContent>
            </TitleSection>
            <AIBadge>
              <Sparkles size={14} />
              {t('create.aiPowered')}
            </AIBadge>
          </HeaderSection>
        </GlassCard>

        <GlassCard>
          <SectionTitle>
            <Info size={18} />
            {t('cover.howItWorks')}
          </SectionTitle>
          <InstructionsSection>
            <InstructionItem>
              <InstructionNumber>1</InstructionNumber>
              <InstructionContent>
                <InstructionTitle>{t('cover.step1Title')}</InstructionTitle>
                <InstructionText>
                  {t('cover.step1Desc')}
                </InstructionText>
              </InstructionContent>
            </InstructionItem>
            <InstructionItem>
              <InstructionNumber>2</InstructionNumber>
              <InstructionContent>
                <InstructionTitle>{t('cover.step2Title')}</InstructionTitle>
                <InstructionText>
                  {t('cover.step2Desc')}
                </InstructionText>
              </InstructionContent>
            </InstructionItem>
            <InstructionItem>
              <InstructionNumber>3</InstructionNumber>
              <InstructionContent>
                <InstructionTitle>{t('cover.step3Title')}</InstructionTitle>
                <InstructionText>
                  {t('cover.step3Desc')}
                </InstructionText>
              </InstructionContent>
            </InstructionItem>
          </InstructionsSection>
        </GlassCard>

        <GlassCard>
          <CoverUpload onComplete={handleCoverComplete} />
        </GlassCard>
      </LeftPanel>

      <RightPanel>
        <GlassCard>
          <SectionTitle>
            <Clock size={18} />
            {t('cover.recentCovers')}
            {recentCovers.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#8B8B9F' }}>
                {t('cover.coverCount', { count: recentCovers.length })}
              </span>
            )}
          </SectionTitle>

          {loading ? (
            <LoadingState>
              <Loader2 size={32} color="#FA2D48" className="spin" />
              <LoadingText>{t('cover.loadingCovers')}</LoadingText>
            </LoadingState>
          ) : error ? (
            <ErrorState>
              <ErrorText>{error}</ErrorText>
              <RetryButton onClick={() => window.location.reload()}>{t('cover.retry')}</RetryButton>
            </ErrorState>
          ) : recentCovers.length > 0 ? (
            <RecentCoversList>
              {recentCovers.map((cover) => (
                <RecentCoverItem key={cover.id}>
                  <CoverThumbnail>
                    <MicIcon size={24} />
                    <PlayOverlay onClick={() => handlePlayToggle(cover.id)}>
                      {playingId === cover.id ? (
                        <Pause size={20} color="white" fill="white" />
                      ) : (
                        <Play size={20} color="white" fill="white" />
                      )}
                    </PlayOverlay>
                  </CoverThumbnail>
                  <CoverInfo>
                    <CoverTitle>{cover.title}</CoverTitle>
                    <CoverMeta>{cover.originalStyle} → {cover.coverStyle} • {cover.duration}</CoverMeta>
                    <CoverTags>
                      {cover.tags.slice(0, 3).map((tag) => (
                        <CoverTag key={tag}>{tag}</CoverTag>
                      ))}
                    </CoverTags>
                  </CoverInfo>
                  <CoverActions>
                    <ActionButton>
                      <Heart size={14} />
                    </ActionButton>
                    <ActionButton>
                      <MoreVertical size={14} />
                    </ActionButton>
                  </CoverActions>
                </RecentCoverItem>
              ))}
            </RecentCoversList>
          ) : (
            <EmptyState>
              <EmptyStateIcon>
                <MicIcon size={32} />
              </EmptyStateIcon>
              <EmptyStateTitle>{t('cover.noCovers')}</EmptyStateTitle>
              <EmptyStateText>{t('cover.createFirst')}</EmptyStateText>
            </EmptyState>
          )}
        </GlassCard>
      </RightPanel>
    </CoverContainer>
  );
};

export default CoverView;

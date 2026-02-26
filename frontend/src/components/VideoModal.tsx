import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, Video, Loader2, Music, Film } from 'lucide-react';
import { musicApi } from '../services/api';
import { useToast } from '../hooks/useToast';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  clipTitle?: string;
  sunoId?: string;
  onSuccess?: (taskId: string) => void;
}

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const ModalContainer = styled.div`
  background: linear-gradient(145deg, rgba(30, 30, 50, 0.95), rgba(20, 20, 35, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const HeaderIcon = styled.div`
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #EC4899, #DB2777);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const HeaderTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
`;

const HeaderSubtitle = styled.p`
  font-size: 0.85rem;
  color: #8B8B9F;
  margin: 4px 0 0 0;
`;

const CloseButton = styled.button`
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8B8B9F;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #FFFFFF;
  }
`;

const ModalBody = styled.div`
  padding: 28px;
`;

const CurrentTrackInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(236, 72, 153, 0.1);
  border: 1px solid rgba(236, 72, 153, 0.2);
  border-radius: 14px;
  margin-bottom: 24px;
`;

const TrackIcon = styled.div`
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #EC4899, #DB2777);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const TrackDetails = styled.div`
  flex: 1;
`;

const TrackName = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: #FFFFFF;
`;

const TrackMeta = styled.div`
  font-size: 0.8rem;
  color: #8B8B9F;
  margin-top: 2px;
`;

const InfoBox = styled.div`
  padding: 20px;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(219, 39, 119, 0.05));
  border: 1px solid rgba(236, 72, 153, 0.2);
  border-radius: 16px;
  margin-bottom: 24px;

  h4 {
    font-size: 0.95rem;
    font-weight: 600;
    color: #F9A8D4;
    margin: 0 0 12px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  p {
    font-size: 0.85rem;
    color: #9B9BB0;
    margin: 0;
    line-height: 1.6;
  }

  ul {
    margin: 12px 0 0 0;
    padding-left: 20px;

    li {
      font-size: 0.85rem;
      color: #9B9BB0;
      margin-bottom: 6px;
    }
  }
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
`;

const FeatureCard = styled.div`
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  text-align: center;

  .icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(219, 39, 119, 0.1));
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 10px;
    color: #EC4899;
  }

  .label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #FFFFFF;
    margin-bottom: 4px;
  }

  .desc {
    font-size: 0.75rem;
    color: #6B6B80;
  }
`;

const WarningBox = styled.div`
  padding: 14px 16px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 12px;
  margin-bottom: 24px;

  p {
    font-size: 0.85rem;
    color: #FCD34D;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const ModalFooter = styled.div`
  display: flex;
  gap: 12px;
  padding: 20px 28px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
`;

const Button = styled.button<{ $primary?: boolean; $disabled?: boolean }>`
  flex: 1;
  padding: 14px 24px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: ${props => props.$disabled ? 0.5 : 1};

  ${props => props.$primary ? `
    background: linear-gradient(135deg, #EC4899, #DB2777);
    border: none;
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(236, 72, 153, 0.3);
    }
  ` : `
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #8B8B9F;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
      color: #FFFFFF;
    }
  `}
`;

const SpinIcon = styled(Loader2)`
  animation: spin 1s linear infinite;

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

export const VideoModal: React.FC<VideoModalProps> = ({
  isOpen,
  onClose,
  clipId,
  clipTitle,
  sunoId,
  onSuccess
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!clipId) {
      toast.showError(t('video.selectTrack', '请选择要生成视频的歌曲'));
      return;
    }

    setLoading(true);
    try {
      const response = await musicApi.generateVideo(clipId, sunoId || clipId);

      if (response.success && response.data?.taskId) {
        toast.showSuccess(t('video.success', '视频生成任务已创建！'));
        onSuccess?.(response.data.taskId);
        onClose();
      } else {
        toast.showError(response.error?.message || t('video.failed', '视频生成失败'));
      }
    } catch (error: any) {
      toast.showError(error.message || t('video.requestFailed', '视频生成请求失败'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <HeaderContent>
            <HeaderIcon>
              <Video size={24} />
            </HeaderIcon>
            <div>
              <HeaderTitle>{t('video.title', '生成音乐视频')}</HeaderTitle>
              <HeaderSubtitle>{t('video.subtitle', '为您的音乐创建AI视频')}</HeaderSubtitle>
            </div>
          </HeaderContent>
          <CloseButton onClick={onClose}>
            <X size={18} />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <CurrentTrackInfo>
            <TrackIcon>
              <Music size={20} />
            </TrackIcon>
            <TrackDetails>
              <TrackName>{clipTitle || t('video.selectedTrack', '选择的歌曲')}</TrackName>
              <TrackMeta>ID: {clipId}</TrackMeta>
            </TrackDetails>
          </CurrentTrackInfo>

          <InfoBox>
            <h4>
              <Film size={18} />
              {t('video.aboutTitle', '关于音乐视频生成')}
            </h4>
            <p>
              {t('video.aboutDesc', 'AI将为您的音乐自动生成一个匹配的视频，视频内容会根据音乐的节奏、风格和情绪进行智能创作。')}
            </p>
            <ul>
              <li>{t('video.feature1', '自动匹配音乐节奏')}</li>
              <li>{t('video.feature2', '根据风格生成画面')}</li>
              <li>{t('video.feature3', '高清视频输出')}</li>
            </ul>
          </InfoBox>

          <FeaturesGrid>
            <FeatureCard>
              <div className="icon">
                <Video size={20} />
              </div>
              <div className="label">{t('video.featureAuto', '自动生成')}</div>
              <div className="desc">{t('video.featureAutoDesc', 'AI智能创作')}</div>
            </FeatureCard>
            <FeatureCard>
              <div className="icon">
                <Music size={20} />
              </div>
              <div className="label">{t('video.featureSync', '节奏同步')}</div>
              <div className="desc">{t('video.featureSyncDesc', '画面配合节拍')}</div>
            </FeatureCard>
          </FeaturesGrid>

          <WarningBox>
            <p>
              <Video size={16} />
              {t('video.warning', '视频生成可能需要较长时间，完成后将自动保存到您的音乐库中。')}
            </p>
          </WarningBox>
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose} $disabled={loading}>
            {t('common.cancel', '取消')}
          </Button>
          <Button $primary onClick={handleSubmit} $disabled={loading}>
            {loading ? (
              <>
                <SpinIcon size={18} />
                {t('video.creating', '生成中...')}
              </>
            ) : (
              <>
                <Video size={18} />
                {t('video.create', '开始生成视频')}
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default VideoModal;

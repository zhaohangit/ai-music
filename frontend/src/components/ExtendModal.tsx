import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, Scissors, Loader2, Music } from 'lucide-react';
import { musicApi } from '../services/api';
import { useToast } from '../hooks/useToast';

interface ExtendModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  clipTitle?: string;
  currentDuration?: number;
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
  max-width: 520px;
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
  background: linear-gradient(135deg, #667EEA, #764BA2);
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

const FormGroup = styled.div`
  margin-bottom: 24px;
`;

const Label = styled.label`
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #9B9BB0;
  margin-bottom: 10px;
`;

const Input = styled.input`
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  color: #FFFFFF;
  font-size: 0.95rem;
  transition: all 0.2s ease;

  &::placeholder {
    color: #6B6B80;
  }

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  color: #FFFFFF;
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
  transition: all 0.2s ease;

  &::placeholder {
    color: #6B6B80;
  }

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const TimeInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TimeInput = styled.input`
  width: 120px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  color: #FFFFFF;
  font-size: 0.95rem;
  text-align: center;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const TimeHint = styled.span`
  font-size: 0.8rem;
  color: #6B6B80;
`;

const TagsInput = styled.input`
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  color: #FFFFFF;
  font-size: 0.95rem;
  transition: all 0.2s ease;

  &::placeholder {
    color: #6B6B80;
  }

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const CurrentTrackInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 14px;
  margin-bottom: 24px;
`;

const TrackIcon = styled.div`
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #667EEA, #764BA2);
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
    background: linear-gradient(135deg, #667EEA, #764BA2);
    border: none;
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
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

export const ExtendModal: React.FC<ExtendModalProps> = ({
  isOpen,
  onClose,
  clipId,
  clipTitle,
  currentDuration,
  onSuccess
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [tags, setTags] = useState('');
  const [continueAt, setContinueAt] = useState<number>(currentDuration || 0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!clipId) {
      toast.showError(t('extend.selectTrack', '请选择要续写的歌曲'));
      return;
    }

    setLoading(true);
    try {
      const response = await musicApi.extend({
        clipId,
        continueAt,
        title: title || undefined,
        lyrics: lyrics || undefined,
        tags: tags || undefined
      });

      if (response.success) {
        toast.showSuccess(t('extend.success', '续写任务已创建！'));
        onSuccess?.(response.data.taskId);
        onClose();
      } else {
        toast.showError(response.error?.message || t('extend.failed', '续写失败'));
      }
    } catch (error: any) {
      toast.showError(error.message || t('extend.requestFailed', '续写请求失败'));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <HeaderContent>
            <HeaderIcon>
              <Scissors size={24} />
            </HeaderIcon>
            <div>
              <HeaderTitle>{t('extend.title', '歌曲续写')}</HeaderTitle>
              <HeaderSubtitle>{t('extend.subtitle', '从指定位置继续创作')}</HeaderSubtitle>
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
              <TrackName>{clipTitle || t('extend.selectedTrack', '选择的歌曲')}</TrackName>
              <TrackMeta>
                ID: {clipId} {currentDuration && `• ${t('extend.duration', '时长')}: ${formatTime(currentDuration)}`}
              </TrackMeta>
            </TrackDetails>
          </CurrentTrackInfo>

          <FormGroup>
            <Label>{t('extend.continueAt', '续写位置 (秒)')}</Label>
            <TimeInputRow>
              <TimeInput
                type="number"
                value={continueAt}
                onChange={(e) => setContinueAt(Number(e.target.value))}
                min={0}
                max={currentDuration || 300}
              />
              <TimeHint>
                {t('extend.continueAtHint', `当前歌曲时长 ${formatTime(currentDuration || 0)}`)}
              </TimeHint>
            </TimeInputRow>
          </FormGroup>

          <FormGroup>
            <Label>{t('extend.title', '续写标题 (可选)')}</Label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('extend.titlePlaceholder', '续写后的歌曲标题')}
            />
          </FormGroup>

          <FormGroup>
            <Label>{t('extend.lyrics', '续写歌词 (可选)')}</Label>
            <TextArea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={t('extend.lyricsPlaceholder', '输入续写部分的歌词...')}
            />
          </FormGroup>

          <FormGroup>
            <Label>{t('extend.tags', '风格标签 (可选)')}</Label>
            <TagsInput
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('extend.tagsPlaceholder', '流行, R&B, 抒情')}
            />
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose} $disabled={loading}>
            {t('common.cancel', '取消')}
          </Button>
          <Button $primary onClick={handleSubmit} $disabled={loading}>
            {loading ? (
              <>
                <SpinIcon size={18} />
                {t('extend.creating', '创建中...')}
              </>
            ) : (
              <>
                <Scissors size={18} />
                {t('extend.create', '开始续写')}
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default ExtendModal;

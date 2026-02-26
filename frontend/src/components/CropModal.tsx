import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, Scissors, Loader2, Music } from 'lucide-react';
import { musicApi } from '../services/api';
import { useToast } from '../hooks/useToast';

interface CropModalProps {
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
  background: linear-gradient(135deg, #F59E0B, #D97706);
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
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const TimeInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const TimeInputGroup = styled.div`
  flex: 1;
`;

const TimeInput = styled.input`
  width: 100%;
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
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const TimeHint = styled.span`
  font-size: 0.8rem;
  color: #6B6B80;
  margin-top: 6px;
  display: block;
`;

const CurrentTrackInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 14px;
  margin-bottom: 24px;
`;

const TrackIcon = styled.div`
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #F59E0B, #D97706);
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

const RangePreview = styled.div`
  margin-top: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
`;

const RangeBar = styled.div`
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  position: relative;
  margin: 12px 0;
`;

const RangeHighlight = styled.div<{ $start: number; $end: number }>`
  position: absolute;
  left: ${props => props.$start}%;
  right: ${props => 100 - props.$end}%;
  height: 100%;
  background: linear-gradient(90deg, #F59E0B, #D97706);
  border-radius: 4px;
`;

const RangeInfo = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #9B9BB0;
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
    background: linear-gradient(135deg, #F59E0B, #D97706);
    border: none;
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(245, 158, 11, 0.3);
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

export const CropModal: React.FC<CropModalProps> = ({
  isOpen,
  onClose,
  clipId,
  clipTitle,
  currentDuration = 180,
  onSuccess
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [cropStart, setCropStart] = useState(0);
  const [cropEnd, setCropEnd] = useState(currentDuration);
  const [loading, setLoading] = useState(false);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTime = (value: string): number => {
    const parts = value.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0;
      const secs = parseInt(parts[1]) || 0;
      return mins * 60 + secs;
    }
    return parseInt(value) || 0;
  };

  const handleStartChange = (value: string) => {
    const seconds = parseTime(value);
    if (seconds >= 0 && seconds < cropEnd) {
      setCropStart(seconds);
    }
  };

  const handleEndChange = (value: string) => {
    const seconds = parseTime(value);
    if (seconds > cropStart && seconds <= currentDuration) {
      setCropEnd(seconds);
    }
  };

  const startPercent = (cropStart / currentDuration) * 100;
  const endPercent = (cropEnd / currentDuration) * 100;
  const cropDuration = cropEnd - cropStart;

  const handleSubmit = async () => {
    if (!clipId) {
      toast.showError(t('crop.selectTrack', '请选择要裁剪的歌曲'));
      return;
    }

    if (cropStart >= cropEnd) {
      toast.showError(t('crop.invalidRange', '裁剪起始时间必须小于结束时间'));
      return;
    }

    setLoading(true);
    try {
      const response = await musicApi.crop({
        clipId,
        cropStartS: cropStart,
        cropEndS: cropEnd
      });

      if (response.success && response.data?.taskId) {
        toast.showSuccess(t('crop.success', '裁剪任务已创建！'));
        onSuccess?.(response.data.taskId);
        onClose();
      } else {
        toast.showError(response.error?.message || t('crop.failed', '裁剪失败'));
      }
    } catch (error: any) {
      toast.showError(error.message || t('crop.requestFailed', '裁剪请求失败'));
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
              <Scissors size={24} />
            </HeaderIcon>
            <div>
              <HeaderTitle>{t('crop.title', '裁剪音乐')}</HeaderTitle>
              <HeaderSubtitle>{t('crop.subtitle', '选择要保留的音乐片段')}</HeaderSubtitle>
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
              <TrackName>{clipTitle || t('crop.selectedTrack', '选择的歌曲')}</TrackName>
              <TrackMeta>
                {t('crop.duration', '时长')}: {formatTime(currentDuration)}
              </TrackMeta>
            </TrackDetails>
          </CurrentTrackInfo>

          <FormGroup>
            <Label>{t('crop.timeRange', '时间范围')}</Label>
            <TimeInputRow>
              <TimeInputGroup>
                <TimeInput
                  type="text"
                  value={formatTime(cropStart)}
                  onChange={(e) => handleStartChange(e.target.value)}
                  placeholder="0:00"
                />
                <TimeHint>{t('crop.startTime', '开始时间')}</TimeHint>
              </TimeInputGroup>
              <span style={{ color: '#8B8B9F', marginTop: '14px' }}>→</span>
              <TimeInputGroup>
                <TimeInput
                  type="text"
                  value={formatTime(cropEnd)}
                  onChange={(e) => handleEndChange(e.target.value)}
                  placeholder={formatTime(currentDuration)}
                />
                <TimeHint>{t('crop.endTime', '结束时间')}</TimeHint>
              </TimeInputGroup>
            </TimeInputRow>
          </FormGroup>

          <RangePreview>
            <RangeBar>
              <RangeHighlight $start={startPercent} $end={endPercent} />
            </RangeBar>
            <RangeInfo>
              <span>{formatTime(cropStart)}</span>
              <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                {t('crop.croppedDuration', '裁剪后时长')}: {formatTime(cropDuration)}
              </span>
              <span>{formatTime(currentDuration)}</span>
            </RangeInfo>
          </RangePreview>
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose} $disabled={loading}>
            {t('common.cancel', '取消')}
          </Button>
          <Button $primary onClick={handleSubmit} $disabled={loading || cropStart >= cropEnd}>
            {loading ? (
              <>
                <SpinIcon size={18} />
                {t('crop.creating', '处理中...')}
              </>
            ) : (
              <>
                <Scissors size={18} />
                {t('crop.create', '开始裁剪')}
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default CropModal;

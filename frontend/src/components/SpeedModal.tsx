import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, Gauge, Loader2, Music } from 'lucide-react';
import { musicApi } from '../services/api';
import { useToast } from '../hooks/useToast';

interface SpeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  clipTitle?: string;
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
  background: linear-gradient(135deg, #8B5CF6, #7C3AED);
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
    border-color: rgba(139, 92, 246, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const CurrentTrackInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 14px;
  margin-bottom: 24px;
`;

const TrackIcon = styled.div`
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #8B5CF6, #7C3AED);
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

const SpeedOptionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 20px;
`;

const SpeedOption = styled.button<{ $selected?: boolean }>`
  padding: 14px 8px;
  background: ${props => props.$selected
    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(124, 58, 237, 0.2))'
    : 'rgba(255, 255, 255, 0.03)'};
  border: ${props => props.$selected
    ? '1px solid rgba(139, 92, 246, 0.5)'
    : '1px solid rgba(255, 255, 255, 0.08)'};
  border-radius: 12px;
  color: ${props => props.$selected ? '#A78BFA' : '#9B9BB0'};
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$selected
      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(124, 58, 237, 0.3))'
      : 'rgba(255, 255, 255, 0.08)'};
    color: ${props => props.$selected ? '#C4B5FD' : '#FFFFFF'};
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  accent-color: #8B5CF6;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  color: #FFFFFF;
  font-size: 0.9rem;
  cursor: pointer;
  flex: 1;
`;

const CheckboxHint = styled.span`
  color: #6B6B80;
  font-size: 0.8rem;
`;

const SpeedPreview = styled.div`
  padding: 16px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 12px;
  margin-top: 20px;

  p {
    font-size: 0.85rem;
    color: #C4B5FD;
    margin: 0;
    text-align: center;
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
    background: linear-gradient(135deg, #8B5CF6, #7C3AED);
    border: none;
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(139, 92, 246, 0.3);
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

const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const SpeedModal: React.FC<SpeedModalProps> = ({
  isOpen,
  onClose,
  clipId,
  clipTitle,
  onSuccess
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [speedMultiplier, setSpeedMultiplier] = useState<0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2>(1);
  const [keepPitch, setKeepPitch] = useState(true);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const getSpeedLabel = (speed: number): string => {
    if (speed === 1) return '1x (原速)';
    if (speed < 1) return `${speed}x (慢)`;
    return `${speed}x (快)`;
  };

  const handleSubmit = async () => {
    if (!clipId) {
      toast.showError(t('speed.selectTrack', '请选择要变速的歌曲'));
      return;
    }

    setLoading(true);
    try {
      const response = await musicApi.adjustSpeed({
        clipId,
        speedMultiplier,
        keepPitch,
        title: title || undefined
      });

      if (response.success && response.data?.taskId) {
        toast.showSuccess(t('speed.success', '变速任务已创建！'));
        onSuccess?.(response.data.taskId);
        onClose();
      } else {
        toast.showError(response.error?.message || t('speed.failed', '变速失败'));
      }
    } catch (error: any) {
      toast.showError(error.message || t('speed.requestFailed', '变速请求失败'));
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
              <Gauge size={24} />
            </HeaderIcon>
            <div>
              <HeaderTitle>{t('speed.title', '调整速度')}</HeaderTitle>
              <HeaderSubtitle>{t('speed.subtitle', '改变音乐播放速度')}</HeaderSubtitle>
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
              <TrackName>{clipTitle || t('speed.selectedTrack', '选择的歌曲')}</TrackName>
              <TrackMeta>ID: {clipId}</TrackMeta>
            </TrackDetails>
          </CurrentTrackInfo>

          <FormGroup>
            <Label>{t('speed.selectSpeed', '选择速度')}</Label>
            <SpeedOptionsGrid>
              {speedOptions.map((speed) => (
                <SpeedOption
                  key={speed}
                  $selected={speedMultiplier === speed}
                  onClick={() => setSpeedMultiplier(speed)}
                >
                  {speed}x
                </SpeedOption>
              ))}
            </SpeedOptionsGrid>
          </FormGroup>

          <FormGroup>
            <CheckboxGroup onClick={() => setKeepPitch(!keepPitch)}>
              <Checkbox
                type="checkbox"
                checked={keepPitch}
                onChange={() => setKeepPitch(!keepPitch)}
              />
              <CheckboxLabel>{t('speed.keepPitch', '保持音调')}</CheckboxLabel>
              <CheckboxHint>{t('speed.keepPitchHint', '变速不变调')}</CheckboxHint>
            </CheckboxGroup>
          </FormGroup>

          <FormGroup>
            <Label>{t('speed.newTitle', '新标题 (可选)')}</Label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('speed.titlePlaceholder', '变速后的歌曲标题')}
            />
          </FormGroup>

          <SpeedPreview>
            <p>
              {t('speed.preview', '当前设置')}: {getSpeedLabel(speedMultiplier)}
              {keepPitch ? ` • ${t('speed.pitchPreserved', '音调保持')}` : ` • ${t('speed.pitchChanged', '音调变化')}`}
            </p>
          </SpeedPreview>
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose} $disabled={loading}>
            {t('common.cancel', '取消')}
          </Button>
          <Button $primary onClick={handleSubmit} $disabled={loading}>
            {loading ? (
              <>
                <SpinIcon size={18} />
                {t('speed.creating', '处理中...')}
              </>
            ) : (
              <>
                <Gauge size={18} />
                {t('speed.create', '开始变速')}
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default SpeedModal;

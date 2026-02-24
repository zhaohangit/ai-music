import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, Sparkles, Loader2, Music } from 'lucide-react';
import { musicApi } from '../services/api';
import { useToast } from '../hooks/useToast';

interface RemasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  clipTitle?: string;
  onSuccess?: (taskIds: string[]) => void;
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
  background: linear-gradient(135deg, #10B981, #059669);
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

const Select = styled.select`
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  color: #FFFFFF;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.4);
    background: rgba(255, 255, 255, 0.05);
  }

  option {
    background: #1A1A2E;
    color: #FFFFFF;
  }
`;

const CurrentTrackInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 14px;
  margin-bottom: 24px;
`;

const TrackIcon = styled.div`
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #10B981, #059669);
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
  padding: 16px;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 12px;
  margin-bottom: 24px;

  p {
    font-size: 0.85rem;
    color: #A5B4FC;
    margin: 0;
    line-height: 1.6;
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
    background: linear-gradient(135deg, #10B981, #059669);
    border: none;
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(16, 185, 129, 0.3);
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

const modelOptions = [
  { value: 'chirp-carp', label: 'Carp (V5质量)' },
  { value: 'chirp-bass', label: 'Bass (V4.5质量)' },
  { value: 'chirp-up', label: 'Up (V4质量)' },
];

const variationOptions = [
  { value: 'subtle', label: '轻微变化' },
  { value: 'normal', label: '标准变化' },
  { value: 'high', label: '大幅变化' },
];

export const RemasterModal: React.FC<RemasterModalProps> = ({
  isOpen,
  onClose,
  clipId,
  clipTitle,
  onSuccess
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [modelName, setModelName] = useState<'chirp-carp' | 'chirp-bass' | 'chirp-up'>('chirp-carp');
  const [variationCategory, setVariationCategory] = useState<'subtle' | 'normal' | 'high'>('normal');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!clipId) {
      toast.showError(t('remaster.selectTrack', '请选择要重制的歌曲'));
      return;
    }

    setLoading(true);
    try {
      const response = await musicApi.remaster({
        clipId,
        modelName,
        variationCategory
      });

      if (response.success) {
        toast.showSuccess(t('remaster.success', 'Remaster任务已创建！'));
        onSuccess?.(response.data?.taskIds || []);
        onClose();
      } else {
        toast.showError(response.error?.message || t('remaster.failed', 'Remaster失败'));
      }
    } catch (error: any) {
      toast.showError(error.message || t('remaster.requestFailed', 'Remaster请求失败'));
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
              <Sparkles size={24} />
            </HeaderIcon>
            <div>
              <HeaderTitle>{t('remaster.title', 'Remaster')}</HeaderTitle>
              <HeaderSubtitle>{t('remaster.subtitle', '提升音质，生成新版本')}</HeaderSubtitle>
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
              <TrackName>{clipTitle || t('remaster.selectedTrack', '选择的歌曲')}</TrackName>
              <TrackMeta>ID: {clipId}</TrackMeta>
            </TrackDetails>
          </CurrentTrackInfo>

          <InfoBox>
            <p>{t('remaster.info', 'Remaster功能将使用AI模型重新处理您的音乐，提升音质并可能生成不同风格的变体版本。')}</p>
          </InfoBox>

          <FormGroup>
            <Label>{t('remaster.model', '模型版本')}</Label>
            <Select value={modelName} onChange={(e) => setModelName(e.target.value as any)}>
              {modelOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>{t('remaster.variation', '变化程度')}</Label>
            <Select value={variationCategory} onChange={(e) => setVariationCategory(e.target.value as any)}>
              {variationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
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
                {t('remaster.creating', '处理中...')}
              </>
            ) : (
              <>
                <Sparkles size={18} />
                {t('remaster.create', '开始Remaster')}
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default RemasterModal;

import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, FileAudio, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { musicApi } from '../services/api';

const ModalOverlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: ${props => props.$isOpen ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const ModalContent = styled.div`
  background: linear-gradient(145deg, rgba(26, 26, 46, 0.98), rgba(15, 15, 35, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 28px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
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

const TrackInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  margin-bottom: 24px;
`;

const TrackIcon = styled.div`
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TrackDetails = styled.div`
  flex: 1;
`;

const TrackName = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: #FFFFFF;
  margin-bottom: 4px;
`;

const TrackFormat = styled.div`
  font-size: 0.8rem;
  color: #8B8B9F;
`;

const InfoBox = styled.div`
  padding: 16px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 12px;
  margin-bottom: 24px;
`;

const InfoText = styled.p`
  font-size: 0.875rem;
  color: #9B9BB0;
  margin: 0;
  line-height: 1.6;
`;

const StatusMessage = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  background: ${props => {
    switch (props.$type) {
      case 'success': return 'rgba(16, 185, 129, 0.1)';
      case 'error': return 'rgba(239, 68, 68, 0.1)';
      default: return 'rgba(102, 126, 234, 0.1)';
    }
  }};
  border: 1px solid ${props => {
    switch (props.$type) {
      case 'success': return 'rgba(16, 185, 129, 0.3)';
      case 'error': return 'rgba(239, 68, 68, 0.3)';
      default: return 'rgba(102, 126, 234, 0.3)';
    }
  }};
  border-radius: 10px;
  margin-bottom: 20px;
  color: ${props => {
    switch (props.$type) {
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      default: return '#667EEA';
    }
  }};
  font-size: 0.875rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  ${props => props.$variant === 'primary' ? `
    background: linear-gradient(135deg, #667EEA, #764BA2);
    border: none;
    color: #FFFFFF;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }
  ` : `
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #FFFFFF;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const SpinAnimation = styled.span`
  animation: spin 1s linear infinite;
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

interface WavModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  clipTitle: string;
  onSuccess?: (taskId: string) => void;
}

export const WavModal: React.FC<WavModalProps> = ({
  isOpen,
  onClose,
  clipId,
  clipTitle,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [isConverting, setIsConverting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleConvert = async () => {
    setIsConverting(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const response = await musicApi.convertToWav(clipId, clipId);

      if (response.success && response.data?.taskId) {
        setStatus('success');
        onSuccess?.(response.data.taskId);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        throw new Error(response.error?.message || t('wav.convertFailed', '转换失败'));
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('wav.convertFailed', '转换失败'));
    } finally {
      setIsConverting(false);
    }
  };

  const handleClose = () => {
    if (!isConverting) {
      setStatus('idle');
      setErrorMessage('');
      onClose();
    }
  };

  return (
    <ModalOverlay $isOpen={isOpen} onClick={handleClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            <FileAudio size={22} />
            {t('wav.title', '转换为WAV格式')}
          </ModalTitle>
          <CloseButton onClick={handleClose} disabled={isConverting}>
            <X size={18} />
          </CloseButton>
        </ModalHeader>

        <TrackInfo>
          <TrackIcon>
            <FileAudio size={24} color="#667EEA" />
          </TrackIcon>
          <TrackDetails>
            <TrackName>{clipTitle}</TrackName>
            <TrackFormat>{t('wav.currentFormat', '当前格式: MP3')} → WAV</TrackFormat>
          </TrackDetails>
        </TrackInfo>

        <InfoBox>
          <InfoText>
            {t('wav.description', 'WAV是无损音频格式，适合专业音频编辑和后期处理。转换后的文件将保持原始音质，但文件大小会显著增加。')}
          </InfoText>
        </InfoBox>

        {status === 'success' && (
          <StatusMessage $type="success">
            <CheckCircle size={18} />
            {t('wav.convertSuccess', '转换任务已创建，请稍后查看结果')}
          </StatusMessage>
        )}

        {status === 'error' && (
          <StatusMessage $type="error">
            <AlertCircle size={18} />
            {errorMessage || t('wav.convertFailed', '转换失败')}
          </StatusMessage>
        )}

        <ButtonGroup>
          <Button
            $variant="secondary"
            onClick={handleClose}
            disabled={isConverting}
          >
            {t('common.cancel', '取消')}
          </Button>
          <Button
            $variant="primary"
            onClick={handleConvert}
            disabled={isConverting || status === 'success'}
          >
            {isConverting ? (
              <>
                <SpinAnimation>
                  <Loader2 size={18} />
                </SpinAnimation>
                {t('wav.converting', '转换中...')}
              </>
            ) : (
              <>
                <FileAudio size={18} />
                {t('wav.convert', '转换为WAV')}
              </>
            )}
          </Button>
        </ButtonGroup>
      </ModalContent>
    </ModalOverlay>
  );
};

export default WavModal;

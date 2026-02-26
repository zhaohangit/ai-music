import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, Scissors, Loader2, Music, ChevronDown, ChevronUp, Settings } from 'lucide-react';
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

const AdvancedToggle = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #9B9BB0;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 16px;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #FFFFFF;
  }
`;

const AdvancedSection = styled.div`
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
`;

const SliderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SliderLabel = styled.div`
  min-width: 100px;
  font-size: 0.85rem;
  color: #9B9BB0;
  font-weight: 500;
`;

const Slider = styled.input`
  flex: 1;
  -webkit-appearance: none;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: linear-gradient(135deg, #667EEA, #764BA2);
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.2s ease;

    &:hover {
      transform: scale(1.1);
    }
  }
`;

const SliderValue = styled.div`
  min-width: 40px;
  text-align: right;
  font-size: 0.85rem;
  color: #667EEA;
  font-weight: 600;
`;

const GenderSelector = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
`;

const GenderOption = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  ${props => props.$active ? `
    background: linear-gradient(135deg, #667EEA, #764BA2);
    border: none;
    color: white;
  ` : `
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #9B9BB0;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #FFFFFF;
    }
  `}
`;

const AdvancedTagInput = styled.input`
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  color: #FFFFFF;
  font-size: 0.85rem;
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

const AdvancedLabel = styled.label`
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #9B9BB0;
  margin-bottom: 10px;
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

  // Advanced settings
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [negativeTags, setNegativeTags] = useState('');
  const [vocalGender, setVocalGender] = useState<'m' | 'f' | ''>('');
  const [styleWeight, setStyleWeight] = useState(50);
  const [weirdnessConstraint, setWeirdnessConstraint] = useState(50);
  const [audioWeight, setAudioWeight] = useState(50);

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
        tags: tags || undefined,
        negativeTags: negativeTags || undefined,
        metadata: {
          vocal_gender: vocalGender || undefined,
          control_sliders: {
            style_weight: styleWeight !== 50 ? styleWeight : undefined,
            weirdness_constraint: weirdnessConstraint !== 50 ? weirdnessConstraint : undefined,
          },
          audio_weight: audioWeight !== 50 ? audioWeight : undefined,
        }
      });

      if (response.success && response.data?.taskId) {
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

          <AdvancedToggle onClick={() => setAdvancedOpen(!advancedOpen)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={16} />
              {t('extend.advancedSettings', '高级设置')}
            </span>
            {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </AdvancedToggle>

          {advancedOpen && (
            <AdvancedSection>
              <FormGroup style={{ marginBottom: '16px' }}>
                <AdvancedLabel>{t('extend.negativeTags', '排除风格标签')}</AdvancedLabel>
                <AdvancedTagInput
                  type="text"
                  value={negativeTags}
                  onChange={(e) => setNegativeTags(e.target.value)}
                  placeholder={t('extend.negativeTagsPlaceholder', '不想要的风格，如：嘈杂, 重金属')}
                />
              </FormGroup>

              <AdvancedLabel style={{ marginBottom: '10px' }}>{t('extend.vocalGender', '人声性别')}</AdvancedLabel>
              <GenderSelector>
                <GenderOption
                  $active={vocalGender === ''}
                  onClick={() => setVocalGender('')}
                >
                  {t('extend.random', '随机')}
                </GenderOption>
                <GenderOption
                  $active={vocalGender === 'm'}
                  onClick={() => setVocalGender('m')}
                >
                  {t('extend.male', '男声')}
                </GenderOption>
                <GenderOption
                  $active={vocalGender === 'f'}
                  onClick={() => setVocalGender('f')}
                >
                  {t('extend.female', '女声')}
                </GenderOption>
              </GenderSelector>

              <SliderRow>
                <SliderLabel>{t('extend.styleWeight', '风格权重')}</SliderLabel>
                <Slider
                  type="range"
                  min="0"
                  max="100"
                  value={styleWeight}
                  onChange={(e) => setStyleWeight(Number(e.target.value))}
                />
                <SliderValue>{styleWeight}%</SliderValue>
              </SliderRow>

              <SliderRow>
                <SliderLabel>{t('extend.weirdness', '创意程度')}</SliderLabel>
                <Slider
                  type="range"
                  min="0"
                  max="100"
                  value={weirdnessConstraint}
                  onChange={(e) => setWeirdnessConstraint(Number(e.target.value))}
                />
                <SliderValue>{weirdnessConstraint}%</SliderValue>
              </SliderRow>

              <SliderRow>
                <SliderLabel>{t('extend.audioWeight', '音频权重')}</SliderLabel>
                <Slider
                  type="range"
                  min="0"
                  max="100"
                  value={audioWeight}
                  onChange={(e) => setAudioWeight(Number(e.target.value))}
                />
                <SliderValue>{audioWeight}%</SliderValue>
              </SliderRow>
            </AdvancedSection>
          )}
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

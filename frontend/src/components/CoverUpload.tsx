import React, { useState, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  Music as MusicIcon,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  FileAudio,
  CheckCircle,
  Sliders
} from 'lucide-react';
import { musicApi } from '../services/api';

export interface CoverUploadProps {
  className?: string;
  onComplete?: (result: any) => void;
}

const UploadContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const DropZone = styled.div<{ $isDragging: boolean; $hasFile: boolean }>`
  position: relative;
  width: 100%;
  min-height: ${props => props.$hasFile ? 'auto' : '200px'};
  background: ${props => props.$isDragging
    ? 'rgba(250, 45, 72, 0.1)'
    : '#FFFFFF'};
  border: 2px dashed ${props => props.$isDragging
    ? 'rgba(250, 45, 72, 0.5)'
    : 'rgba(0, 0, 0, 0.15)'};
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: #F5F5F7;
    border-color: rgba(250, 45, 72, 0.3);
  }
`;

const DropZoneContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
`;

const UploadIcon = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(250, 45, 72, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FA2D48;
`;

const DropZoneText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DropZoneTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
`;

const DropZoneSubtitle = styled.p`
  font-size: 0.875rem;
  color: #6E6E73;
  margin: 0;
`;

const AcceptedFormats = styled.span`
  font-size: 0.75rem;
  color: #FA2D48;
  background: rgba(250, 45, 72, 0.1);
  padding: 4px 12px;
  border-radius: 12px;
  margin-top: 8px;
  display: inline-block;
`;

const FilePreview = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #F5F5F7;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
`;

const FileIcon = styled.div`
  width: 48px;
  height: 48px;
  background: rgba(250, 45, 72, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FA2D48;
`;

const FileInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FileName = styled.span`
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1D1D1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FileMeta = styled.span`
  display: block;
  font-size: 0.75rem;
  color: #6E6E73;
  margin-top: 4px;
`;

const RemoveButton = styled.button`
  width: 36px;
  height: 36px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6E6E73;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: #EF4444;
  }
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1D1D1F;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Input = styled.input`
  width: 100%;
  padding: 14px 16px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  color: #1D1D1F;
  font-size: 0.9375rem;
  transition: all 0.2s ease;

  &::placeholder {
    color: #86868B;
  }

  &:focus {
    outline: none;
    border-color: rgba(250, 45, 72, 0.5);
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.08);
  }
`;

const HelpText = styled.span`
  font-size: 0.75rem;
  color: #6E6E73;
  line-height: 1.4;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 16px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  color: #1D1D1F;
  font-size: 0.9375rem;
  line-height: 1.6;
  resize: vertical;
  transition: all 0.2s ease;

  &::placeholder {
    color: #86868B;
  }

  &:focus {
    outline: none;
    border-color: rgba(250, 45, 72, 0.5);
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.08);
  }
`;

const TagsInput = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  min-height: 48px;

  &:focus-within {
    border-color: rgba(250, 45, 72, 0.5);
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.08);
  }
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(250, 45, 72, 0.1);
  border: 1px solid rgba(250, 45, 72, 0.2);
  border-radius: 20px;
  font-size: 0.875rem;
  color: #FA2D48;
  font-weight: 500;
`;

const TagRemove = styled.button`
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: #FA2D48;
  cursor: pointer;
  padding: 0;

  &:hover {
    color: #D91E36;
  }
`;

const TagInput = styled.input`
  flex: 1;
  min-width: 120px;
  background: none;
  border: none;
  color: #1D1D1F;
  font-size: 0.9375rem;
  outline: none;

  &::placeholder {
    color: #86868B;
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 8px;
`;

const CreateButton = styled.button<{ $disabled?: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 32px;
  background: #FA2D48;
  border: none;
  border-radius: 16px;
  font-size: 1rem;
  font-weight: 600;
  color: #FFFFFF;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.$disabled ? 0.5 : 1};
  transition: all 0.3s ease;
  box-shadow: 0 8px 24px rgba(250, 45, 72, 0.3);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(250, 45, 72, 0.4);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  padding: 16px 24px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1D1D1F;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #F5F5F7;
    border-color: rgba(0, 0, 0, 0.15);
  }
`;

const ProgressContainer = styled.div`
  width: 100%;
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`;

const ProgressSpinner = styled.div`
  width: 48px;
  height: 48px;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  svg {
    animation: spin 1s linear infinite;
    color: #667EEA;
  }
`;

const ProgressText = styled.div`
  text-align: center;
`;

const ProgressTitle = styled.h4`
  font-size: 1rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 4px 0;
`;

const ProgressSubtitle = styled.p`
  font-size: 0.875rem;
  color: #8B8B9F;
  margin: 0;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
`;

const ProgressBarFill = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: linear-gradient(90deg, #667EEA, #764BA2);
  border-radius: 3px;
  transition: width 0.3s ease;
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(245, 87, 108, 0.1);
  border: 1px solid rgba(245, 87, 108, 0.3);
  border-radius: 12px;
  color: #F5576C;
  font-size: 0.875rem;
`;

const SuccessMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  color: #10B981;
  font-size: 0.875rem;
`;

const HiddenInput = styled.input`
  display: none;
`;

// Advanced Settings Styles
const AdvancedSettings = styled.div<{ $open: boolean }>`
  max-height: ${props => props.$open ? '600px' : '0'};
  overflow: hidden;
  transition: max-height 0.3s ease;
`;

const AdvancedSection = styled.div`
  padding: 14px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  margin-top: 8px;
`;

const AdvancedSectionTitle = styled.h4`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #86868B;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const SettingItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
`;

const SettingLabel = styled.span`
  font-size: 0.6875rem;
  font-weight: 600;
  color: #86868B;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const SelectorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
  margin-bottom: 0;
`;

const SelectorOption = styled.button<{ $selected?: boolean }>`
  padding: 10px 12px;
  background: ${props => props.$selected
    ? 'rgba(250, 45, 72, 0.1)'
    : '#F5F5F7'};
  border: ${props => props.$selected
    ? '1px solid rgba(250, 45, 72, 0.3)'
    : '1px solid transparent'};
  border-radius: 8px;
  color: ${props => props.$selected ? '#FA2D48' : '#6E6E73'};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$selected
      ? 'rgba(250, 45, 72, 0.15)'
      : '#E8E8ED'};
    color: ${props => props.$selected ? '#FA2D48' : '#1D1D1F'};
  }
`;

const AdvancedTagInput = styled.input`
  width: 100%;
  padding: 12px 14px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  color: #1D1D1F;
  font-size: 0.875rem;
  transition: all 0.2s ease;

  &::placeholder {
    color: #86868B;
  }

  &:focus {
    outline: none;
    border-color: rgba(250, 45, 72, 0.5);
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.08);
  }
`;

const SliderContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
`;

const SliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const SliderValue = styled.span`
  font-size: 0.75rem;
  color: #FA2D48;
  font-weight: 600;
`;

const StyledSlider = styled.input`
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #E8E8ED;
  border-radius: 2px;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #FA2D48;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(250, 45, 72, 0.3);
    transition: transform 0.15s ease;
  }

  &::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #FA2D48;
    cursor: pointer;
    border: none;
  }
`;

const AdvancedButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: #F5F5F7;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  color: #6E6E73;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 8px;

  &:hover {
    background: #E8E8ED;
    color: #1D1D1F;
  }
`;

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const CoverUpload: React.FC<CoverUploadProps> = ({
  className,
  onComplete
}) => {
  const { t } = useTranslation();
  const tagInputRef = useRef<HTMLInputElement>(null);

  // 使用 URL 输入而不是文件上传
  const [audioUrl, setAudioUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'generating' | 'complete' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [lyrics, setLyrics] = useState('');

  // Advanced settings state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [negativeTags, setNegativeTags] = useState('');
  const [vocalGender, setVocalGender] = useState<'m' | 'f' | ''>('');
  const [styleWeight, setStyleWeight] = useState(0.5);
  const [weirdnessConstraint, setWeirdnessConstraint] = useState(0.5);
  const [audioWeight, setAudioWeight] = useState(0.5); // 音频参考度（仅上传音频可用）

  // 验证 URL 格式
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleTagInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  }, [tags]);

  const handleReset = useCallback(() => {
    setAudioUrl('');
    setPrompt('');
    setTags([]);
    setTagInput('');
    setLyrics('');
    setError(null);
    setUploadId(null);
    setUploadStage('idle');
    setUploadProgress(0);
    // Reset advanced settings
    setAdvancedOpen(false);
    setNegativeTags('');
    setVocalGender('');
    setStyleWeight(0.5);
    setWeirdnessConstraint(0.5);
    setAudioWeight(0.5);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!audioUrl.trim()) {
      setError(t('cover.enterAudioUrl'));
      return;
    }

    if (!isValidUrl(audioUrl.trim())) {
      setError(t('cover.enterValidUrl'));
      return;
    }

    if (!prompt.trim() && tags.length === 0) {
      setError(t('cover.providePromptOrTag'));
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadStage('uploading');
    setUploadProgress(30);

    try {
      // 步骤1: 上传音频 URL 到 Suno API
      const uploadResponse = await musicApi.uploadAudioUrl(audioUrl.trim());
      setUploadProgress(30);

      if (uploadResponse.success && uploadResponse.data) {
        const uploadData = uploadResponse.data as { uploadId?: string; upload_id?: string; id?: string };
        const uploadTaskId = uploadData.uploadId || uploadData.upload_id || uploadData.id;
        if (!uploadTaskId) {
          throw new Error('Upload failed: no task ID returned');
        }
        setUploadId(uploadTaskId);

        // 步骤2: 等待上传任务完成，获取 custom_id (suno clip_id)
        setUploadProgress(50);
        let coverClipId = uploadTaskId;

        // 查询上传任务状态以获取 custom_id
        try {
          const statusResponse = await musicApi.waitForCompletion(uploadTaskId, 120000);
          if (statusResponse.success && statusResponse.data) {
            // custom_id 是 suno 的音乐ID，用于翻唱
            coverClipId = (statusResponse.data as any).custom_id || uploadTaskId;
          }
        } catch (waitError) {
          // 如果等待失败，尝试直接使用任务ID
          console.warn('Wait for upload completion failed, using task ID directly:', waitError);
        }

        // 步骤3: 生成翻唱
        setUploadStage('generating');
        setUploadProgress(80);

        // Build cover params with advanced settings
        const coverParams: any = {
          cover_clip_id: coverClipId,
          prompt: prompt.trim() || undefined,
          tags: tags.join(', ') || undefined,
          lyrics: lyrics.trim() || undefined,
        };

        // Add negative tags if specified
        if (negativeTags.trim()) {
          coverParams.negativeTags = negativeTags.trim();
        }

        // Add metadata if any advanced settings are non-default
        const hasMetadata = vocalGender || styleWeight !== 0.5 || weirdnessConstraint !== 0.5 || audioWeight !== 0.5;
        if (hasMetadata) {
          coverParams.metadata = {};
          if (vocalGender) {
            coverParams.metadata.vocal_gender = vocalGender;
          }
          if (styleWeight !== 0.5 || weirdnessConstraint !== 0.5) {
            coverParams.metadata.control_sliders = {};
            if (styleWeight !== 0.5) {
              coverParams.metadata.control_sliders.style_weight = styleWeight;
            }
            if (weirdnessConstraint !== 0.5) {
              coverParams.metadata.control_sliders.weirdness_constraint = weirdnessConstraint;
            }
          }
          // audio_weight - 音频参考度（仅上传音频可用）
          if (audioWeight !== 0.5) {
            coverParams.metadata.audio_weight = audioWeight;
          }
        }

        const coverResponse = await musicApi.createCover(coverParams);

        setUploadProgress(100);

        if (coverResponse.success) {
          setUploadStage('complete');
          if (onComplete) {
            onComplete(coverResponse.data);
          }
        } else {
          throw new Error(coverResponse.error?.message || 'Failed to create cover');
        }
      } else {
        throw new Error(uploadResponse.error?.message || 'Failed to upload audio URL');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setUploadStage('error');
    } finally {
      setIsUploading(false);
    }
  }, [audioUrl, prompt, tags, lyrics, onComplete, negativeTags, vocalGender, styleWeight, weirdnessConstraint, audioWeight]);

  const isFormValid = audioUrl.trim() && isValidUrl(audioUrl.trim()) && (prompt.trim() || tags.length > 0);

  return (
    <UploadContainer className={className}>
      {uploadStage === 'idle' || uploadStage === 'error' ? (
        <>
          <FormSection>
            <SectionLabel>{t('cover.audioUrlLabel')}</SectionLabel>
            <Input
              type="url"
              placeholder={t('cover.audioUrlPlaceholder')}
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              disabled={isUploading}
            />
            <HelpText>
              {t('cover.audioUrlHelp')}
            </HelpText>
          </FormSection>

          {error && (
            <ErrorMessage>
              <AlertCircle size={18} />
              {error}
            </ErrorMessage>
          )}

          <FormSection>
            <SectionLabel>{t('cover.promptLabel')}</SectionLabel>
            <TextArea
              placeholder={t('cover.promptPlaceholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isUploading}
            />
          </FormSection>

          <FormSection>
            <SectionLabel>{t('cover.tagsLabel')}</SectionLabel>
            <TagsInput onClick={() => tagInputRef.current?.focus()}>
              {tags.map((tag) => (
                <Tag key={tag}>
                  {tag}
                  <TagRemove onClick={() => handleRemoveTag(tag)}>
                    <X size={14} />
                  </TagRemove>
                </Tag>
              ))}
              <TagInput
                ref={tagInputRef}
                type="text"
                placeholder={tags.length === 0 ? t('cover.tagsPlaceholder') : ''}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                disabled={isUploading}
              />
            </TagsInput>
          </FormSection>

          <FormSection>
            <SectionLabel>{t('cover.lyricsLabel')}</SectionLabel>
            <TextArea
              placeholder={t('cover.lyricsPlaceholder')}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              disabled={isUploading}
            />
          </FormSection>

          {/* Advanced Settings */}
          <AdvancedButton onClick={() => setAdvancedOpen(!advancedOpen)} type="button">
            <Sliders size={18} />
            {t('create.advancedSettings', '高级设置')}
          </AdvancedButton>

          <AdvancedSettings $open={advancedOpen}>
            <AdvancedSection>
              <AdvancedSectionTitle>
                <Sliders size={16} />
                {t('create.advancedControls', '高级控制')}
              </AdvancedSectionTitle>

              {/* Vocal Gender */}
              <SettingItem>
                <SettingLabel>{t('create.vocalGender', '声音性别')}</SettingLabel>
                <SelectorGrid>
                  {[
                    { value: 'm' as const, label: t('create.male', '男声') },
                    { value: 'f' as const, label: t('create.female', '女声') },
                    { value: '' as const, label: t('create.neutral', '不指定') }
                  ].map((option) => (
                    <SelectorOption
                      key={option.value}
                      $selected={vocalGender === option.value}
                      onClick={() => setVocalGender(option.value)}
                      type="button"
                    >
                      {option.label}
                    </SelectorOption>
                  ))}
                </SelectorGrid>
              </SettingItem>

              {/* Negative Tags */}
              <SettingItem>
                <SettingLabel>{t('create.negativeTags', '排除风格')}</SettingLabel>
                <AdvancedTagInput
                  type="text"
                  placeholder={t('create.negativeTagsPlaceholder', '例如: 重金属, 嘈杂, 电子...')}
                  value={negativeTags}
                  onChange={(e) => setNegativeTags(e.target.value)}
                />
              </SettingItem>

              {/* Style Weight Slider */}
              <SliderContainer>
                <SliderHeader>
                  <SettingLabel>{t('create.styleWeight', '风格匹配度')}</SettingLabel>
                  <SliderValue>{Math.round(styleWeight * 100)}%</SliderValue>
                </SliderHeader>
                <StyledSlider
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={styleWeight}
                  onChange={(e) => setStyleWeight(parseFloat(e.target.value))}
                />
              </SliderContainer>

              {/* Weirdness Constraint Slider */}
              <SliderContainer>
                <SliderHeader>
                  <SettingLabel>{t('create.weirdnessConstraint', '创意程度')}</SettingLabel>
                  <SliderValue>{Math.round(weirdnessConstraint * 100)}%</SliderValue>
                </SliderHeader>
                <StyledSlider
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={weirdnessConstraint}
                  onChange={(e) => setWeirdnessConstraint(parseFloat(e.target.value))}
                />
              </SliderContainer>

              {/* Audio Weight Slider - 仅上传音频可用 */}
              <SliderContainer>
                <SliderHeader>
                  <SettingLabel>{t('create.audioWeight', '音频参考度')}</SettingLabel>
                  <SliderValue>{Math.round(audioWeight * 100)}%</SliderValue>
                </SliderHeader>
                <StyledSlider
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={audioWeight}
                  onChange={(e) => setAudioWeight(parseFloat(e.target.value))}
                />
              </SliderContainer>
            </AdvancedSection>
          </AdvancedSettings>

          <ButtonContainer>
            <SecondaryButton onClick={handleReset} disabled={isUploading}>
              {t('cover.resetBtn')}
            </SecondaryButton>
            <CreateButton
              onClick={handleSubmit}
              $disabled={!isFormValid || isUploading}
              disabled={!isFormValid || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {t('cover.processing')}
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  {t('cover.createBtn')}
                </>
              )}
            </CreateButton>
          </ButtonContainer>
        </>
      ) : uploadStage === 'complete' ? (
        <SuccessMessage>
          <CheckCircle size={24} />
          <div>
            <ProgressTitle>{t('cover.successTitle')}</ProgressTitle>
            <ProgressSubtitle>{t('cover.successSubtitle')}</ProgressSubtitle>
          </div>
        </SuccessMessage>
      ) : (
        <ProgressContainer>
          <ProgressSpinner>
            <Loader2 size={48} />
          </ProgressSpinner>
          <ProgressText>
            <ProgressTitle>
              {uploadStage === 'uploading' ? t('cover.uploadingAudio') : t('cover.creatingCover')}
            </ProgressTitle>
            <ProgressSubtitle>
              {uploadStage === 'uploading'
                ? t('cover.uploadWait')
                : t('cover.aiGenerating')}
            </ProgressSubtitle>
          </ProgressText>
          <ProgressBar>
            <ProgressBarFill $progress={uploadProgress} />
          </ProgressBar>
        </ProgressContainer>
      )}
    </UploadContainer>
  );
};

export default CoverUpload;

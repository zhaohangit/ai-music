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
  CheckCircle
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
    ? 'rgba(102, 126, 234, 0.15)'
    : 'rgba(255, 255, 255, 0.08)'};
  border: 2px dashed ${props => props.$isDragging
    ? 'rgba(102, 126, 234, 0.5)'
    : 'rgba(255, 255, 255, 0.15)'};
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(102, 126, 234, 0.3);
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
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #667EEA;
`;

const DropZoneText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DropZoneTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0;
`;

const DropZoneSubtitle = styled.p`
  font-size: 0.875rem;
  color: #8B8B9F;
  margin: 0;
`;

const AcceptedFormats = styled.span`
  font-size: 0.75rem;
  color: #667EEA;
  background: rgba(102, 126, 234, 0.1);
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
`;

const FileIcon = styled.div`
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #667EEA;
`;

const FileInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FileName = styled.span`
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FileMeta = styled.span`
  display: block;
  font-size: 0.75rem;
  color: #8B8B9F;
  margin-top: 4px;
`;

const RemoveButton = styled.button`
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
    background: rgba(245, 87, 108, 0.1);
    border-color: rgba(245, 87, 108, 0.3);
    color: #F5576C;
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
  color: #8B8B9F;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Input = styled.input`
  width: 100%;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #FFFFFF;
  font-size: 0.9375rem;
  transition: all 0.2s ease;

  &::placeholder {
    color: #8B8B9F;
  }

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.5);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const HelpText = styled.span`
  font-size: 0.75rem;
  color: #8B8B9F;
  line-height: 1.4;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #FFFFFF;
  font-size: 0.9375rem;
  line-height: 1.6;
  resize: vertical;
  transition: all 0.2s ease;

  &::placeholder {
    color: #8B8B9F;
  }

  &:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.5);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const TagsInput = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  min-height: 48px;

  &:focus-within {
    border-color: rgba(102, 126, 234, 0.5);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 20px;
  font-size: 0.875rem;
  color: #667EEA;
  font-weight: 500;
`;

const TagRemove = styled.button`
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: #667EEA;
  cursor: pointer;
  padding: 0;

  &:hover {
    color: #F5576C;
  }
`;

const TagInput = styled.input`
  flex: 1;
  min-width: 120px;
  background: none;
  border: none;
  color: #FFFFFF;
  font-size: 0.9375rem;
  outline: none;

  &::placeholder {
    color: #8B8B9F;
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
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border: none;
  border-radius: 16px;
  font-size: 1rem;
  font-weight: 600;
  color: #FFFFFF;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.$disabled ? 0.5 : 1};
  transition: all 0.3s ease;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(102, 126, 234, 0.4);
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #FFFFFF;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
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
        const uploadTaskId = uploadResponse.data.uploadId || uploadResponse.data.upload_id || uploadResponse.data.id;
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

        const coverResponse = await musicApi.createCover({
          cover_clip_id: coverClipId,
          prompt: prompt.trim() || undefined,
          tags: tags.join(', ') || undefined,
          lyrics: lyrics.trim() || undefined,
        });

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
  }, [audioUrl, prompt, tags, lyrics, onComplete]);

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

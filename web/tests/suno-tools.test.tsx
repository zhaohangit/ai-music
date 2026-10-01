import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SunoToolsPage } from '../src/components/SunoToolsPage';
import type { MusicOperationProfile, Track } from '../src/types';
import { makeTrack } from './track-fixture';

const operation = (operationCode: string, estimatedCredits: number): MusicOperationProfile => ({
  action: operationCode,
  operationCode,
  identifier: `ai.music.${operationCode}`,
  displayName: operationCode,
  available: true,
  executable: true,
  chargingEnabled: true,
  previewExecutable: false,
  estimatedCredits,
  priceVersion: 'test-v1',
  outputCount: operationCode.includes('pair') ? 2 : 1,
  modelIds: [],
  parameters: {},
});

const tracks: Track[] = [makeTrack({ id: 'track-1', title: '雨夜霓虹', status: 'done' })];

describe('SunoToolsPage', () => {
  it('separates executable music tools from unsupported design-only tools', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SunoToolsPage
      tracks={tracks}
      operations={[operation('generation_pair', 320), operation('extend_pair', 320)]}
      loading={false}
      error={null}
      initialPrompt=""
      onNavigate={onNavigate}
      onOpenTrack={vi.fn()}
      onUsePrompt={vi.fn()}
      onOpenAi={vi.fn()}
      onRetry={vi.fn()}
    />);

    expect(screen.getByText('双版本音乐生成')).toBeInTheDocument();
    expect(screen.getByText('5 轨音频分离')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '等待服务端能力' })[0]).toBeDisabled();
    await user.click(screen.getAllByRole('button', { name: /打开创作工作台/ })[0]);
    expect(onNavigate).toHaveBeenCalledWith('create');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Player } from '../src/components/Player';
import { makeTrack } from './track-fixture';

vi.mock('../src/components/Waveform', () => ({
  Waveform: () => <div role="slider" aria-label="播放进度" />,
}));

const renderPlayer = (track = makeTrack(), onPlayingChange = vi.fn()) => render(
  <Player
    track={track}
    playing={false}
    onPlayingChange={onPlayingChange}
    onPrev={vi.fn()}
    onNext={vi.fn()}
    onEnded={vi.fn()}
  />,
);

describe('Player', () => {
  it('only exposes a download link for a completed track with an audio asset', () => {
    const { rerender } = renderPlayer(makeTrack({ status: 'queued', stage: 'queued', progress: 0, file: 'premature.mp3' }));

    expect(screen.queryByRole('link', { name: '下载音频' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载音频（暂不可用）' })).toBeDisabled();

    rerender(
      <Player
        track={makeTrack()}
        playing={false}
        onPlayingChange={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onEnded={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: '下载音频' })).toHaveAttribute('href', '/api/tracks/track-1/audio?download=1');
  });

  it('keeps playback disabled when a done track has no audio file or URL', () => {
    renderPlayer(makeTrack({ file: null, audioUrl: null }));

    expect(screen.getByRole('button', { name: '播放' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: '下载音频' })).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '音量' })).toBeDisabled();
  });

  it('toggles playback with Space outside form controls and ignores Space on the volume input', () => {
    const onPlayingChange = vi.fn();
    renderPlayer(makeTrack(), onPlayingChange);

    fireEvent.keyDown(document.body, { code: 'Space' });
    expect(onPlayingChange).toHaveBeenCalledTimes(1);
    expect(onPlayingChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(screen.getByRole('slider', { name: '音量' }), { code: 'Space' });
    expect(onPlayingChange).toHaveBeenCalledTimes(1);
  });

  it('preserves native Space activation for a focused button instead of toggling playback', async () => {
    const user = userEvent.setup();
    const onPlayingChange = vi.fn();
    const onNext = vi.fn();
    render(
      <Player
        track={makeTrack()}
        playing={false}
        onPlayingChange={onPlayingChange}
        onPrev={vi.fn()}
        onNext={onNext}
        onEnded={vi.fn()}
      />,
    );

    screen.getByRole('button', { name: '下一首' }).focus();
    await user.keyboard(' ');

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPlayingChange).not.toHaveBeenCalled();
  });
});

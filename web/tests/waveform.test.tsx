import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Waveform } from '../src/components/Waveform';

vi.mock('../src/lib/peaks', () => ({
  BUCKETS: 4,
  loadPeaks: vi.fn(() => new Promise<number[]>(() => undefined)),
}));

describe('Waveform', () => {
  it('exposes slider semantics and supports keyboard and pointer seeking', () => {
    const onSeek = vi.fn();
    render(<Waveform url="/audio.mp3" progress={0.5} onSeek={onSeek} />);
    const slider = screen.getByRole('slider', { name: '播放进度' });

    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(slider).toHaveAttribute('aria-valuetext', '50%');
    expect(slider).toHaveAttribute('aria-orientation', 'horizontal');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSeek.mock.calls.map(([value]) => value)).toEqual([0.51, 0.49, 0.6, 0, 1]);

    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, right: 200, bottom: 40, left: 0, width: 200, height: 40, toJSON: () => ({}),
    });
    fireEvent.click(slider, { clientX: 150 });
    expect(onSeek).toHaveBeenLastCalledWith(0.75);
  });

  it('clamps invalid progress before exposing it to assistive technology', () => {
    const { rerender } = render(<Waveform url="/audio.mp3" progress={2} onSeek={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '100');

    rerender(<Waveform url="/audio.mp3" progress={Number.NaN} onSeek={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
  });
});

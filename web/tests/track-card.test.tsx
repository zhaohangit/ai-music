import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrackCard } from '../src/components/TrackCard';
import { makeTrack } from './track-fixture';

const callbacks = {
  onSelect: vi.fn(),
  onPlay: vi.fn(),
  onDelete: vi.fn(),
  onReuse: vi.fn(),
  onRetry: vi.fn(),
};

describe('TrackCard billing projection', () => {
  it('renders ModelCross settlement and ignores MXAPI merchant point diagnostics', () => {
    render(<TrackCard
      track={makeTrack({
        billingStatus: 'captured',
        estimatedCredits: 20,
        settledCredits: 10,
        pointsCost: 999,
        pointsRefunded: true,
      })}
      groupSize={2}
      active={false}
      playing={false}
      selected={false}
      {...callbacks}
    />);

    expect(screen.getByText('已结算 10 积分')).toBeInTheDocument();
    expect(screen.queryByText(/消耗 999 积分/)).not.toBeInTheDocument();
    expect(screen.queryByText(/积分已退还/)).not.toBeInTheDocument();
  });

  it('labels disabled billing as a safe preview using the server estimate', () => {
    render(<TrackCard
      track={makeTrack({ billingStatus: 'disabled', estimatedCredits: 20, settledCredits: 0 })}
      groupSize={1}
      active={false}
      playing={false}
      selected={false}
      {...callbacks}
    />);

    expect(screen.getByText('未通过 ModelCross 结算')).toHaveAttribute('title', '本地直连可能产生 API 账户费用，请以对应账户用量记录为准');
  });
});

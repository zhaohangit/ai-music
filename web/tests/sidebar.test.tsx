import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../src/components/Sidebar';
import type { SessionSummary } from '../src/types';

const session: SessionSummary = {
  authenticated: true,
  user: { id: 'user-1', subject: 'user-1', name: '创作者', email: 'creator@example.com', role: 'user' },
  account: {
    balance: 1600,
    availableBalance: 1540,
    reservedBalance: 60,
    currency: 'credits',
    subscription: { name: 'Creator Pro', status: 'active', includedCredits: 2000 },
  },
};

function mockMobileViewport(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: query === '(max-width: 1023px)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function MobileSidebarHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开主导航</button>
      <Sidebar view="create" onChange={vi.fn()} counts={{ inflight: 2, total: 14 }} session={session} mobileOpen={open} onMobileClose={() => setOpen(false)} />
    </>
  );
}

describe('Sidebar usage summary', () => {
  beforeEach(() => mockMobileViewport(false));

  it('hides the API capabilities menu from regular users', () => {
    render(<Sidebar view="create" onChange={vi.fn()} counts={{ inflight: 0, total: 0 }} session={session} />);
    expect(screen.queryByRole('button', { name: '接口能力' })).not.toBeInTheDocument();

    render(<Sidebar view="create" onChange={vi.fn()} counts={{ inflight: 0, total: 0 }} session={{ ...session, user: { ...session.user!, role: 'admin' } }} />);
    expect(screen.getByRole('button', { name: '接口能力' })).toBeInTheDocument();
  });

  it('shows verifiable library and task facts without a fabricated usage percentage', () => {
    render(<Sidebar view="create" onChange={vi.fn()} counts={{ inflight: 2, total: 14 }} session={session} />);

    expect(screen.getByText('当前作品库')).toBeInTheDocument();
    expect(screen.getByText('14 首')).toBeInTheDocument();
    expect(screen.getByText('进行中任务')).toBeInTheDocument();
    expect(screen.getByText('Creator Pro 每账期包含 2,000 积分，实际余额与用量以订单页为准。')).toBeInTheDocument();
    expect(screen.queryByText('本月创作')).not.toBeInTheDocument();
    expect(screen.queryByText(/套餐内创作额度将在下个账期重置/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps a closed mobile drawer inert and restores focus after Escape, backdrop, or close button', async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    render(<MobileSidebarHarness />);
    const trigger = screen.getByRole('button', { name: '打开主导航' });
    const sidebar = document.getElementById('app-sidebar');
    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar).toHaveAttribute('inert');

    await user.click(trigger);
    expect(sidebar).not.toHaveAttribute('aria-hidden');
    expect(sidebar).not.toHaveAttribute('inert');
    const drawer = within(sidebar as HTMLElement);
    const closeButton = drawer.getByRole('button', { name: '关闭导航' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    const first = drawer.getByRole('button', { name: 'MuseFlow 创作首页' });
    const last = drawer.getByRole('button', { name: '查看账户与积分' });
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    first.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar).toHaveAttribute('inert');

    await user.click(trigger);
    await waitFor(() => expect(closeButton).toHaveFocus());
    const backdrop = screen.getByRole('button', { name: '关闭导航遮罩' });
    await user.click(backdrop);
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await waitFor(() => expect(closeButton).toHaveFocus());
    await user.click(closeButton);
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

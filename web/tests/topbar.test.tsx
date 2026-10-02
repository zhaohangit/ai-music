import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Topbar } from '../src/components/Topbar';
import type { SessionSummary } from '../src/types';

const session: SessionSummary = {
  authenticated: true,
  user: { id: 'user-1', subject: 'user-1', name: '创作者', email: 'creator@example.com', role: 'user' },
  account: {
    balance: 1600,
    availableBalance: 1540,
    reservedBalance: 60,
    currency: 'credits',
    subscription: { name: 'Creator Pro', status: 'active' },
  },
};

function renderTopbar(currentSession = session, onView = vi.fn()) {
  return render(<Topbar view="create" session={currentSession} theme="dark" mobileMenuOpen={false} onMenu={vi.fn()} onThemeToggle={vi.fn()} onView={onView} onPublicHome={vi.fn()} onLogout={vi.fn()} />);
}

describe('Topbar', () => {

  it('groups secondary controls behind a mobile actions menu', async () => {
    const user = userEvent.setup();
    renderTopbar();
    const actions = screen.getByRole('button', { name: '打开更多顶部操作' });
    expect(screen.queryByRole('menu', { name: '顶部操作' })).not.toBeInTheDocument();
    await user.click(actions);
    const menu = screen.getByRole('menu', { name: '顶部操作' });
    expect(menu).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '切换语言' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '切换主题' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: '切换主题' }));
    expect(screen.queryByRole('menu', { name: '顶部操作' })).not.toBeInTheDocument();
  });
  it('supports menu focus, arrow navigation, and Escape focus restoration', async () => {
    const user = userEvent.setup();
    renderTopbar();
    const trigger = screen.getByRole('button', { name: '打开账户菜单：创作者' });

    await user.click(trigger);
    const first = await screen.findByRole('menuitem', { name: '积分与订单' });
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: '个人设置' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: '退出登录' })).toHaveFocus();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows an unknown balance as pending instead of zero', () => {
    renderTopbar({ ...session, account: null });

    expect(screen.getByRole('button', { name: '可用积分待同步，查看积分与订单' })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('labels the balance control as account navigation and opens billing', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    renderTopbar(session, onView);
    const balance = screen.getByRole('button', { name: '可用积分 1540，查看积分与订单' });

    expect(balance).toHaveTextContent('账单');
    await user.click(balance);

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith('billing');
  });
});

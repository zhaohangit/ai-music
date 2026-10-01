import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { BillingPage, ProjectDialog } from '../src/components/WorkspacePages';
import type { AccountSummary, BillingOrder, BillingSummary, MusicProject } from '../src/types';

vi.mock('../src/api', () => ({ api: { createProject: vi.fn() } }));

function Harness({ onCreated }: { onCreated: (project: MusicProject) => void }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>新建项目</button><ProjectDialog open={open} onClose={() => setOpen(false)} onCreated={onCreated} /></>;
}

const billingAccount: AccountSummary = {
  balance: 1600,
  availableBalance: 1540,
  reservedBalance: 60,
  currency: 'credits',
  subscription: { name: 'Creator Pro', status: 'active', renewsAt: '2026-09-25T00:00:00.000Z' },
  topUpUrl: 'https://modelcross.example/wallet',
  ordersUrl: 'https://modelcross.example/orders',
  accountUrl: 'https://modelcross.example/account',
};

const billingSummary: BillingSummary = {
  account: billingAccount,
  monthSpent: 120,
  monthGeneratedTracks: 8,
  pendingReservations: 20,
};

function renderBillingPage(onRefresh = vi.fn(), orders: BillingOrder[] = []) {
  return {
    onRefresh,
    ...render(<div className="app-shell"><BillingPage
        summary={billingSummary}
        orders={orders}
        account={billingAccount}
        summaryError={null}
        ordersError={null}
        loadingSummary={false}
        loadingOrders={false}
        onRetrySummary={vi.fn()}
        onRetryOrders={vi.fn()}
        onRefresh={onRefresh}
      /></div>),
  };
}

describe('ProjectDialog', () => {
  beforeEach(() => vi.mocked(api.createProject).mockReset());

  it('traps focus, blocks every close path while submitting, and restores focus', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    let resolveProject!: (project: MusicProject) => void;
    vi.mocked(api.createProject).mockReturnValue(new Promise((resolve) => { resolveProject = resolve; }));
    render(<Harness onCreated={onCreated} />);
    const trigger = screen.getByRole('button', { name: '新建项目' });

    await user.click(trigger);
    const title = screen.getByRole('textbox', { name: '项目名称' });
    await waitFor(() => expect(title).toHaveFocus());
    await user.type(title, '霓虹夜航 EP');
    const submit = screen.getByRole('button', { name: '创建项目' });
    submit.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();

    await user.click(submit);
    expect(screen.getByRole('dialog', { name: '新建音乐项目' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '新建音乐项目' })).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector('.dialog-backdrop') as HTMLElement);
    expect(screen.getByRole('dialog', { name: '新建音乐项目' })).toBeInTheDocument();

    await act(async () => resolveProject({ id: 'project-1', title: '霓虹夜航 EP', description: '', trackCount: 0, status: 'active', updatedAt: new Date().toISOString() }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});

describe('BillingPage top-up handoff', () => {
  it('offers safe new-tab and current-page links and restores focus after every close path', async () => {
    const user = userEvent.setup();
    renderBillingPage();
    const trigger = screen.getByRole('button', { name: '前往 ModelCross 充值' });

    await user.click(trigger);
    let dialog = screen.getByRole('dialog', { name: '前往统一钱包充值' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.closest('.app-shell')).toBeNull();
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
    expect(document.querySelector('.billing-page-scroll')).toHaveStyle({ overflow: 'hidden' });
    const close = screen.getByRole('button', { name: '关闭充值入口' });
    await waitFor(() => expect(close).toHaveFocus());

    const newTab = screen.getByRole('link', { name: '新标签页打开' });
    expect(newTab).toHaveAttribute('href', billingAccount.topUpUrl);
    expect(newTab).toHaveAttribute('target', '_blank');
    expect(newTab).toHaveAttribute('rel', 'noopener noreferrer');
    const currentPage = screen.getByRole('link', { name: '当前页打开' });
    expect(currentPage).toHaveAttribute('href', billingAccount.topUpUrl);
    expect(currentPage).not.toHaveAttribute('target');
    expect(currentPage).not.toHaveAttribute('rel');

    await user.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '前往统一钱包充值' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert');
    expect(document.querySelector('.billing-page-scroll')).not.toHaveStyle({ overflow: 'hidden' });

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭充值入口' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '前往统一钱包充值' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    dialog = screen.getByRole('dialog', { name: '前往统一钱包充值' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '前往统一钱包充值' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '留在 MuseFlow' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '前往统一钱包充值' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('refreshes the authoritative wallet balance on request', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderBillingPage(onRefresh);

    await user.click(screen.getByRole('button', { name: '刷新余额' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows mirrored top-ups as money and never guesses credits from minor currency units', () => {
    renderBillingPage(vi.fn(), [{
      id: 'topup-cny-1', kind: 'topup', description: 'ModelCross 充值', amount: 9900,
      amountMinor: 9900, currency: 'CNY', credits: null, status: 'paid', createdAt: '2026-08-25T10:00:00.000Z',
    }]);

    expect(screen.getByText('¥99.00')).toBeInTheDocument();
    expect(screen.getByText('支付金额')).toBeInTheDocument();
    expect(screen.queryByText('9,900')).not.toBeInTheDocument();
  });
});

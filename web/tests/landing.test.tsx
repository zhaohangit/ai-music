import axe from 'axe-core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_MODELS, DEMO_SESSION } from '../src/fixtures';
import { LandingPage } from '../src/components/LandingPage';
import type { SessionSummary } from '../src/types';
import { SUNO_OPERATIONS } from './suno-fixture';

const PUBLIC_SESSION: SessionSummary = { authenticated: false, user: null, account: null };
const GENERATION_OPERATION = SUNO_OPERATIONS.find((operation) => operation.operationCode === 'generation_pair');

afterEach(() => window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`));

describe('public product site', () => {
  it('advertises Remaster only for demo models with a documented MXAPI mapping', () => {
    expect(DEMO_MODELS[0]?.id).toBe('chirp-fenix');
    expect(DEMO_MODELS[0]?.capabilities.operations).not.toContain('remaster');
    expect(DEMO_MODELS[1]?.id).toBe('chirp-crow');
    expect(DEMO_MODELS[1]?.capabilities.operations).toContain('remaster');
  });

  it('links the public narrative to the signed-in studio', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    const { container } = render(<LandingPage session={PUBLIC_SESSION} models={DEMO_MODELS} theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={onEnter} onLogin={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: /让每一个想法/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '生成前展示预计积分' })).toBeInTheDocument();
    expect(screen.getByText('公开界面预览 · 演示内容')).toBeInTheDocument();
    expect(screen.getByText('账户动态报价')).toBeInTheDocument();
    expect(screen.getAllByText('登录查看账户价格').length).toBeGreaterThan(0);
    expect(screen.queryByText(/(?:演示预计|预计) \d+ 积分/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /播放/ })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="#"]')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[¥￥]\s*\d/);
    await user.click(screen.getAllByRole('button', { name: /开始创作/ })[0]);
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it('has no detectable axe violations', async () => {
    const { container } = render(<LandingPage session={PUBLIC_SESSION} models={DEMO_MODELS} theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={vi.fn()} onLogin={vi.fn()} />);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('uses a viewport-height landing scroller and reports real scroll progress', async () => {
    const user = userEvent.setup();
    render(<LandingPage session={PUBLIC_SESSION} models={DEMO_MODELS} theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={vi.fn()} onLogin={vi.fn()} />);
    const scroller = screen.getByTestId('landing-scroll');
    expect(scroller).toHaveClass('h-full', 'overflow-y-auto');

    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 800 },
      scrollHeight: { configurable: true, value: 3200 },
      scrollTop: { configurable: true, writable: true, value: 600 },
    });
    fireEvent.scroll(scroller);
    expect(document.querySelector('.landing-header')).toHaveClass('landing-header-scrolled');
    expect(document.querySelector<HTMLElement>('.landing-progress > span')).toHaveStyle({ transform: 'scaleX(0.25)' });

    const scrollTo = vi.fn();
    Object.defineProperty(scroller, 'scrollTo', { configurable: true, value: scrollTo });
    await user.click(screen.getByRole('button', { name: 'MuseFlow 首页' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('marks the trust section active at the scroll boundary and clears stale public hashes on both top actions', async () => {
    const user = userEvent.setup();
    render(<LandingPage session={PUBLIC_SESSION} models={DEMO_MODELS} theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={vi.fn()} onLogin={vi.fn()} />);
    const scroller = screen.getByTestId('landing-scroll');
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 800 },
      scrollHeight: { configurable: true, value: 3200 },
      scrollTop: { configurable: true, writable: true, value: 2400 },
      scrollTo: { configurable: true, value: vi.fn() },
    });

    fireEvent.scroll(scroller);
    expect(screen.getByRole('link', { name: '安全' })).toHaveAttribute('aria-current', 'location');
    expect(document.querySelector<HTMLElement>('.landing-progress > span')).toHaveStyle({ transform: 'scaleX(1)' });

    window.location.hash = '#pricing';
    await user.click(screen.getByRole('button', { name: 'MuseFlow 首页' }));
    expect(window.location.hash).toBe('');

    window.location.hash = '#trust';
    await user.click(screen.getByRole('button', { name: '返回页面顶部' }));
    expect(window.location.hash).toBe('');
  });

  it('restores a public section hash inside the nested landing scroller after a direct load', async () => {
    window.location.hash = '#pricing';
    const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const top = this.id === 'pricing' ? 1840 : this.getAttribute('data-testid') === 'landing-scroll' ? 40 : 0;
      return { x: 0, y: top, top, right: 0, bottom: top, left: 0, width: 0, height: 0, toJSON: () => ({}) };
    });

    render(<LandingPage session={PUBLIC_SESSION} models={DEMO_MODELS} theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={vi.fn()} onLogin={vi.fn()} />);

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 1800, behavior: 'auto' }));
    expect(document.getElementById('pricing')).toHaveFocus();
    rect.mockRestore();
    if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  });

  it('moves keyboard focus to the main content when the skip link is activated', async () => {
    const user = userEvent.setup();
    render(<LandingPage session={PUBLIC_SESSION} models={DEMO_MODELS} theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={vi.fn()} onLogin={vi.fn()} />);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('tabindex', '-1');

    await user.click(screen.getByRole('link', { name: '跳到主要内容' }));
    expect(main).toHaveFocus();
  });

  it('exposes a focusable mobile menu that closes with Escape', async () => {
    const user = userEvent.setup();
    const onMenuOpenChange = vi.fn();
    const props = { session: PUBLIC_SESSION, models: DEMO_MODELS, theme: 'dark' as const, onMenuOpenChange, onThemeToggle: vi.fn(), onEnter: vi.fn(), onLogin: vi.fn() };
    const { rerender } = render(<LandingPage {...props} menuOpen={false} />);
    await user.click(screen.getByRole('button', { name: '打开导航' }));
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);

    rerender(<LandingPage {...props} menuOpen={true} />);
    expect(screen.getByRole('button', { name: '关闭导航' })).toHaveAttribute('aria-expanded', 'true');
    const firstLink = within(screen.getByRole('navigation', { name: '移动端公开导航' })).getByRole('link', { name: /功能/ });
    await waitFor(() => expect(firstLink).toHaveFocus());
    await user.click(firstLink);
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(false);

    rerender(<LandingPage {...props} menuOpen={false} />);
    await user.click(screen.getByRole('button', { name: '打开导航' }));
    rerender(<LandingPage {...props} menuOpen={true} />);
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: '移动端公开导航' })).getByRole('link', { name: /功能/ })).toHaveFocus());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: '关闭导航' })).toHaveFocus();
  });

  it('uses only the authenticated generation_pair dynamic quote', () => {
    const serverModels = DEMO_MODELS.map((model) => ({
      ...model,
      estimatedCredits: { ...model.estimatedCredits, generatePair: 999 },
    }));
    render(<LandingPage session={DEMO_SESSION} models={serverModels} generationOperation={{ ...GENERATION_OPERATION!, estimatedCredits: 27, priceVersion: 'account-price-v27' }} theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={vi.fn()} onLogin={vi.fn()} />);

    expect(screen.getAllByText('预计 27 积分').length).toBeGreaterThanOrEqual(3);
    expect(document.body).not.toHaveTextContent('999');
    expect(screen.queryByText(/演示预计/)).not.toBeInTheDocument();
  });

  it('fails closed when an authenticated generation quote or price version is missing', () => {
    const serverModels = [{
      ...DEMO_MODELS[0],
      estimatedCredits: { ...DEMO_MODELS[0].estimatedCredits, generatePair: 999 },
    }];
    render(<LandingPage session={DEMO_SESSION} models={serverModels} generationOperation={{ ...GENERATION_OPERATION!, estimatedCredits: 27, priceVersion: null }} pricingError="动作与价格目录缺少价格版本" theme="dark" menuOpen={false} onMenuOpenChange={vi.fn()} onThemeToggle={vi.fn()} onEnter={vi.fn()} onLogin={vi.fn()} />);

    expect(screen.getAllByText('动态估价不可用').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('alert')).toHaveTextContent('未使用缓存或演示价格替代');
    expect(document.body).not.toHaveTextContent('999');
    expect(screen.queryByText(/演示预计/)).not.toBeInTheDocument();
  });
});

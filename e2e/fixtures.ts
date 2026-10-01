import path from 'node:path';
import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

type ConsoleAudit = { messages: string[] };

/** Every E2E test fails on browser warnings, errors, or uncaught exceptions. */
export const test = base.extend<ConsoleAudit>({
  messages: async ({ page }, use) => {
    const messages: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') {
        messages.push(`console.${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
    await use(messages);
    expect(messages, '页面运行期间不应出现 console warning/error 或未捕获异常').toEqual([]);
  },
});

export { expect };

function uniqueSubject(testInfo: TestInfo): string {
  const project = testInfo.project.name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 20);
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${project}-${testInfo.workerIndex}-${nonce}`.slice(0, 64);
}

export async function loginAsDevelopmentUser(page: Page, testInfo: TestInfo): Promise<string> {
  const subject = uniqueSubject(testInfo);
  const response = await page.request.post('/api/auth/dev-login', {
    data: { subject, name: `E2E ${testInfo.project.name}`, admin: false },
  });
  expect(response.status(), `开发登录失败：${await response.text()}`).toBe(200);
  await page.goto('/#/create');
  await expect(page.getByRole('heading', { name: '创作工作台', exact: true })).toBeVisible();
  return subject;
}

export async function navigateWorkspace(page: Page, name: string): Promise<void> {
  const currentLabels: Record<string, string> = {
    '作品库': '音乐资产库',
    'AI 歌词工作室': '歌词工作室',
    '任务中心': '任务调度中心',
    '设置': '系统与偏好',
    '积分与订单': '账单与 Credits',
  };
  const currentName = currentLabels[name] ?? name;
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 1024) {
    await page.getByRole('button', { name: '打开主导航' }).click();
  }
  const escapedName = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('navigation', { name: '主导航', exact: true })
    .getByRole('button', { name: new RegExp(`^${escapedName}(?:\\s|$)`) }).click();
  await expect(page.getByRole('heading', { name: currentName, exact: true }).first()).toBeVisible();
}

export async function expectNamedInteractiveControls(page: Page): Promise<void> {
  const unnamed = await page.locator('button, a[href], input, textarea, select').evaluateAll((elements) => elements
    .filter((element) => {
      const node = element as HTMLElement;
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const labelledBy = node.getAttribute('aria-labelledby');
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')
        : '';
      const id = node.id;
      const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || '' : '';
      return ![
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        labelledText,
        explicitLabel,
        node.textContent,
        (node as HTMLInputElement).placeholder,
        (node as HTMLImageElement).alt,
      ].some((value) => value?.trim());
    })
    .map((element) => `${element.tagName.toLowerCase()}#${(element as HTMLElement).id || '(no-id)'}`));
  expect(unnamed, '可交互控件必须具有可访问名称').toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document, `页面不应横向溢出：${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewport + 1);
}

export async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (globalThis as unknown as {
      axe: { run: (root: Document) => Promise<{ violations: Array<{
        id: string;
        impact: string | null;
        help: string;
        nodes: Array<{ target: unknown; html: string; failureSummary?: string }>;
      }> }> };
    }).axe;
    const result = await axe.run(document);
    return result.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
      }));
  });
  expect(violations, '页面不应存在 serious/critical axe 可访问性问题').toEqual([]);
}

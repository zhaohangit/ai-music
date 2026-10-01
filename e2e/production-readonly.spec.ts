import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_PRODUCTION, '只在显式 E2E_PRODUCTION=true 时运行线上只读验收');

test('production landing and health are reachable without mutating account state', async ({ page }) => {
  const health = await page.request.get('/health/ready');
  expect(health.status()).toBe(200);
  const healthBody = await health.json() as { status?: string; checks?: Record<string, boolean> };
  expect(healthBody.status).toBe('ready');

  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/AI Music Studio/);
  await expect(page.getByRole('heading', { name: /让每一个想法/ })).toBeVisible();

  const landing = page.locator('.landing');
  await expect(landing).toBeVisible();
  const metrics = await landing.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.overflowY).toBe('auto');

  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/(?:^|;)default-src 'self'(?:;|$)/);
  expect(csp).toMatch(/(?:^|;)script-src 'self'(?:;|$)/);
});

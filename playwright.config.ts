import path from 'node:path';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 40_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never', outputFolder: 'node_modules/.cache/playwright-report' }]] : 'line',
  outputDir: path.join(process.cwd(), 'node_modules/.cache/museflow-playwright-results'),
  use: {
    baseURL,
    // The application keeps its production Helmet CSP unchanged. Test pages bypass enforcement
    // only so the harness can inject axe-core; platform.spec separately asserts the real header.
    bypassCSP: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    contextOptions: { reducedMotion: 'reduce' },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-390-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});

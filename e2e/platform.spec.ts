import { expect, expectNamedInteractiveControls, expectNoHorizontalOverflow, expectNoSeriousAxeViolations, loginAsDevelopmentUser, navigateWorkspace, test } from './fixtures';

test('真实服务端继续发送严格 CSP，Playwright 只在测试上下文绕过执行', async ({ page }) => {
  const response = await page.request.get('/');
  expect(response.ok()).toBeTruthy();
  const csp = response.headers()['content-security-policy'];
  expect(csp, '生产入口必须保留 Helmet Content-Security-Policy').toBeTruthy();
  expect(csp).toMatch(/(?:^|;)default-src 'self'(?:;|$)/);
  expect(csp).toMatch(/(?:^|;)script-src 'self'(?:;|$)/);
  expect(csp).toMatch(/(?:^|;)frame-ancestors 'none'(?:;|$)/);
  const scriptDirective = csp?.split(';').find((directive) => directive.startsWith("script-src ")) ?? '';
  expect(scriptDirective).not.toContain("'unsafe-inline'");
  expect(scriptDirective).not.toContain("'unsafe-eval'");
});

test('公开首页通过开发登录进入完整创作工作台', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /让每一个想法/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MuseFlow 首页' })).toBeVisible();
  await page.getByRole('button', { name: '开始创作', exact: true }).first().click();

  await expect(page).toHaveURL(/#\/create$/);
  await expect(page.getByRole('heading', { name: '创作工作台', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '创作输入' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '模型与生成参数' })).toBeVisible();
  await expect(page.getByText('2 个独立版本', { exact: true })).toBeVisible();
  await expect(page.getByText('预计消耗', { exact: true })).toBeVisible();
  const health = await (await page.request.get('/api/health')).json() as { billingLive?: boolean };
  await expect(page.getByText(health.billingLive
    ? /生成时先预留积分.*最终消费以账单记录为准/
    : /安全预览模式.*不会发起真实预扣或结算/)).toBeVisible();
  await expectNamedInteractiveControls(page);
  await expectNoHorizontalOverflow(page);
});

test('创作台允许在生成前选择保留一首或两首歌曲', async ({ page }, testInfo) => {
  await loginAsDevelopmentUser(page, testInfo);
  await page.goto('/#/create');
  await expect(page.getByText('生成数量', { exact: true })).toBeVisible();
  const oneSong = page.getByRole('button', { name: '1 首', exact: true });
  const twoSongs = page.getByRole('button', { name: '2 首', exact: true });
  await expect(oneSong).toHaveAttribute('aria-pressed', 'false');
  await expect(twoSongs).toHaveAttribute('aria-pressed', 'true');
  await oneSong.click();
  await expect(oneSong).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 个独立版本', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /生成 1 首歌曲/ })).toBeVisible();
  await twoSongs.click();
  await expect(page.getByText('2 个独立版本', { exact: true })).toBeVisible();
});

test('真实服务端模型目录向 Web 下发完整上传、续作与资产能力', async ({ page }, testInfo) => {
  await loginAsDevelopmentUser(page, testInfo);
  const response = await page.request.get('/api/catalog/music-models');
  expect(response.status()).toBe(200);
  const models = await response.json() as Array<{
    id: string;
    displayName: string;
    enabled: boolean;
    capabilities: {
      operations: string[];
      vocalGender: boolean;
      styleWeight?: { min: number; max: number; step: number; default: number } | null;
      weirdness?: { min: number; max: number; step: number; default: number } | null;
      maxTitleLength: number;
      maxDescriptionLength: number;
      maxStyleLength: number;
      maxLyricsLength: number;
      maxNegativeTagsLength: number;
    };
  }>;
  const enabled = models.filter((model) => model.enabled);
  expect(enabled.length).toBeGreaterThan(0);
  for (const model of enabled) {
    expect(model.capabilities.operations).toEqual(expect.arrayContaining([
      'generate', 'upload', 'upload_extend', 'aligned_lyrics', 'video', 'convert_wav',
    ]));
    expect(model.capabilities.maxTitleLength).toBeGreaterThan(0);
  }
  const fenix = enabled.find((model) => model.id === 'chirp-fenix');
  if (fenix) expect(fenix.capabilities).toMatchObject({
    maxTitleLength: 100,
    maxDescriptionLength: 1000,
    maxStyleLength: 1000,
    maxLyricsLength: 5000,
    maxNegativeTagsLength: 1000,
  });
  const v4 = enabled.find((model) => model.id === 'chirp-v4');
  if (v4) expect(v4.capabilities).toMatchObject({
    maxTitleLength: 80,
    maxDescriptionLength: 1000,
    maxStyleLength: 200,
    maxLyricsLength: 3000,
    maxNegativeTagsLength: 200,
  });
  const v45All = enabled.find((model) => model.id === 'chirp-auk-turbo');
  if (v45All) expect(v45All.displayName).toBe('Suno V4.5 All');
  const soundModelIds = enabled
    .filter((model) => model.capabilities.operations.includes('sound'))
    .map((model) => model.id)
    .sort();
  expect(soundModelIds, 'MXAPI /music/sound 只允许 Suno V5 与 V5.5').toEqual(['chirp-crow', 'chirp-fenix']);
  for (const legacyId of ['chirp-v3-0', 'chirp-v3-5']) {
    const legacy = enabled.find((model) => model.id === legacyId);
    expect(legacy, `${legacyId} 应存在于兼容模型目录`).toBeTruthy();
    expect(legacy?.capabilities.operations).not.toContain('remaster');
    expect(legacy?.capabilities.operations).not.toContain('sound');
    expect(legacy?.capabilities.vocalGender).toBe(false);
    expect(legacy?.capabilities.styleWeight ?? null).toBeNull();
    expect(legacy?.capabilities.weirdness ?? null).toBeNull();
  }
  if (v4) {
    expect(v4.capabilities.operations).not.toContain('sound');
    expect(v4.capabilities.vocalGender).toBe(false);
    expect(v4.capabilities.styleWeight ?? null).toBeNull();
    expect(v4.capabilities.weirdness ?? null).toBeNull();
  }

  const operationResponse = await page.request.get('/api/catalog/music-operations');
  expect(operationResponse.status()).toBe(200);
  const operations = await operationResponse.json() as Array<{
    action: string;
    operationCode: string;
    outputCount: number;
    modelIds?: string[];
    estimatedCredits: number | null;
    priceVersion: string | null;
    parameters: Record<string, unknown>;
  }>;
  const byCode = (code: string) => operations.find((operation) => operation.operationCode === code);
  const generationOverrides = [
    'model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental',
    'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
  ];
  expect(operations.map((operation) => operation.operationCode)).toEqual(expect.arrayContaining([
    'generation_pair', 'sound_pair', 'extend_pair', 'cover_pair', 'remaster_pair',
    'upload_single', 'upload_copyright_single', 'upload_extend_pair', 'upload_copyright_extend_pair',
    'whole_song_single', 'crop_single', 'speed_single', 'aligned_lyrics_single',
    'video_single', 'convert_wav_single',
  ]));
  expect(byCode('sound_pair')).toMatchObject({
    action: 'sound',
    operationCode: 'sound_pair',
    outputCount: 2,
    modelIds: ['chirp-crow', 'chirp-fenix'],
    parameters: {
      title: { type: 'string', required: true, maxLength: 100, wireName: 'title' },
      tags: { type: 'string', required: true, maxLength: 1000, wireName: 'tags' },
      model: { type: 'string', required: true, enum: ['chirp-crow', 'chirp-fenix'], wireName: 'mv' },
      tempo: { type: 'number', required: false, default: 99, wireName: 'tempo' },
      key: { type: 'string', required: false, default: 'D', wireName: 'key' },
      loop: { type: 'boolean', required: false, default: true, wireName: 'loop' },
    },
  });
  expect(byCode('sound_pair')?.estimatedCredits).toEqual(expect.any(Number));
  expect(Number(byCode('sound_pair')?.estimatedCredits)).toBeGreaterThanOrEqual(0);
  expect(byCode('sound_pair')?.priceVersion).toEqual(expect.any(String));
  expect(byCode('extend_pair')?.parameters).toMatchObject({ generationOverrides });
  expect(byCode('cover_pair')?.parameters).toMatchObject({ generationOverrides });
  expect(byCode('upload_extend_pair')?.parameters).toMatchObject({ generationOverrides });
  expect(byCode('upload_copyright_extend_pair')?.parameters).toMatchObject({ generationOverrides });
  expect(byCode('remaster_pair')?.parameters).toMatchObject({
    variation: { enum: ['subtle', 'normal', 'high'], modelIds: ['chirp-crow', 'chirp-fenix'], default: 'normal' },
  });
  expect(byCode('aligned_lyrics_single')?.parameters).toMatchObject({ lyrics: { minLength: 1, maxLength: 5000 } });
});

test('公开首页支持真实滚轮滚动且内容卡片不裁切', async ({ page }) => {
  await page.goto('/');
  const landing = page.getByTestId('landing-scroll');
  await expect(landing).toBeVisible();

  const initial = await landing.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
  expect(initial.overflowY).toBe('auto');
  expect(initial.scrollWidth).toBeLessThanOrEqual(initial.clientWidth + 1);

  const box = await landing.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box?.x ?? 0) + Math.min(180, (box?.width ?? 360) / 2), (box?.y ?? 0) + Math.min(320, (box?.height ?? 640) / 2));
  await page.mouse.wheel(0, Math.max(700, box?.height ?? 0));
  await expect.poll(() => landing.evaluate((element) => element.scrollTop)).toBeGreaterThan(80);
  await expect(page.locator('.landing-header')).toHaveClass(/landing-header-scrolled/);

  const featureMetrics = await page.locator('.feature-card').evaluateAll((cards) => cards.map((card) => ({
    clientHeight: card.clientHeight,
    scrollHeight: card.scrollHeight,
  })));
  expect(featureMetrics.length).toBeGreaterThan(0);
  expect(featureMetrics.every(({ clientHeight, scrollHeight }) => scrollHeight <= clientHeight + 1), `功能卡片内容不得被裁切：${JSON.stringify(featureMetrics)}`).toBe(true);

  const studioOverflow = await page.locator('.hero-studio').evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(studioOverflow.scrollWidth).toBeLessThanOrEqual(studioOverflow.clientWidth + 1);
  await expectNoHorizontalOverflow(page);
});

test('1280x720 桌面首屏会露出真实产品预览且不产生横向溢出', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '桌面短视口专项');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const studio = page.locator('.hero-studio');
  await expect(studio).toBeVisible();
  const box = await studio.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.y ?? 720, '产品交互预览的顶部必须在首屏内可见').toBeLessThan(720);
  await expect(page.getByText('产品交互预览', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('公开首页锚点、移动菜单与两个回顶入口保持一致的滚动和焦点状态', async ({ page }) => {
  await page.goto('/');
  const landing = page.getByTestId('landing-scroll');
  const mobile = (page.viewportSize()?.width || 0) < 768;

  if (mobile) {
    const menuButton = page.getByRole('button', { name: '打开导航' });
    await menuButton.click();
    const mobileNav = page.getByRole('navigation', { name: '移动端公开导航' });
    await expect(mobileNav.getByRole('link', { name: /功能/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menuButton).toBeFocused();
    await expect(mobileNav).toBeHidden();

    const sections = [['功能', 'features'], ['界面示例', 'showcase'], ['模型估算', 'pricing'], ['安全', 'trust']] as const;
    for (const [name, id] of sections) {
      await menuButton.click();
      const nav = page.getByRole('navigation', { name: '移动端公开导航' });
      await nav.getByRole('link', { name: new RegExp(name) }).click();
      await expect(nav).toBeHidden();
      await expect.poll(() => new URL(page.url()).hash).toBe(`#${id}`);
      await expect(page.locator(`#${id}`)).toBeFocused();
    }
  } else {
    const nav = page.getByRole('navigation', { name: '公开导航' });
    const sections = [['功能', 'features'], ['界面示例', 'showcase'], ['模型估算', 'pricing'], ['安全', 'trust']] as const;
    for (const [name, id] of sections) {
      const link = nav.getByRole('link', { name });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(link).toHaveAttribute('aria-current', 'location');
      await expect(page.locator(`#${id}`)).toBeFocused();
    }
  }

  await expect.poll(() => landing.evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'MuseFlow 首页' }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await expect.poll(() => landing.evaluate((element) => element.scrollTop)).toBe(0);

  if (mobile) {
    await page.getByRole('button', { name: '打开导航' }).click();
    await page.getByRole('navigation', { name: '移动端公开导航' }).getByRole('link', { name: /安全/ }).click();
  } else {
    await page.getByRole('navigation', { name: '公开导航' }).getByRole('link', { name: '安全' }).click();
  }
  await expect(page).toHaveURL(/#trust$/);
  await page.getByRole('button', { name: '返回页面顶部' }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await expect.poll(() => landing.evaluate((element) => element.scrollTop)).toBe(0);

  await page.goto('/#trust');
  const restoredLanding = page.getByTestId('landing-scroll');
  await expect.poll(() => restoredLanding.evaluate((element) =>
    Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop),
  )).toBeLessThanOrEqual(2);
});

test('项目表单创建后幂等重放只保留一个可见项目', async ({ page }, testInfo) => {
  await loginAsDevelopmentUser(page, testInfo);
  const title = `幂等项目 ${Date.now().toString(36)}`;
  const description = '同一请求重放不能创建重复项目';
  await navigateWorkspace(page, '项目与专辑');
  await page.getByRole('button', { name: '新建项目', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '新建音乐项目' });
  await dialog.getByRole('textbox', { name: '项目名称' }).fill(title);
  await dialog.getByRole('textbox', { name: '项目描述' }).fill(description);
  const createdResponse = page.waitForResponse((response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '创建项目' }).click();
  const first = await createdResponse;
  expect(first.status()).toBe(201);
  expect(first.headers()['idempotent-replay']).toBe('false');
  const firstProject = await first.json() as { id: string };
  const key = first.request().headers()['idempotency-key'];
  expect(key).toMatch(/^project-create-/);
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1);

  const replay = await page.request.post('/api/projects', {
    data: { title, description },
    headers: { 'Idempotency-Key': key },
  });
  expect(replay.status()).toBe(200);
  expect(replay.headers()['idempotent-replay']).toBe('true');
  const replayedProject = await replay.json() as { id: string };
  expect(replayedProject.id).toBe(firstProject.id);
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1);

  const projects = await (await page.request.get('/api/projects')).json() as Array<{ id: string }>;
  expect(projects.filter((project) => project.id === firstProject.id)).toHaveLength(1);
  await expectNamedInteractiveControls(page);
});

test('AI 示例先保留原文，用户确认后才应用建议', async ({ page }, testInfo) => {
  await loginAsDevelopmentUser(page, testInfo);
  const catalog = await (await page.request.get('/api/catalog/ai-operations')).json() as Array<{ action: string; previewExecutable: boolean; estimatedCredits: number | null; priceVersion: string | null }>;
  expect(catalog.find((entry) => entry.action === 'prompt.optimize')).toMatchObject({ previewExecutable: true, estimatedCredits: 1 });
  expect(catalog.find((entry) => entry.action === 'prompt.optimize')?.priceVersion).toBeTruthy();
  const original = '雨夜错过末班车的温柔华语流行，副歌逐渐打开。';
  const source = page.getByRole('textbox', { name: '描述你的音乐' });
  await source.fill(original);
  await page.getByRole('button', { name: '使用 AI 优化歌曲描述' }).click();

  const dialog = page.getByRole('dialog', { name: 'AI 创作伙伴' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: '原始内容 / 创作要求' })).toHaveValue(original);
  await dialog.getByRole('button', { name: '生成建议' }).click();
  await expect(dialog.getByRole('heading', { name: '建议版本' })).toBeVisible();
  await expect(dialog.getByText(/只会应用已勾选字段，原文仍保留在历史版本中/)).toBeVisible();
  await expect(source).toHaveValue(original);

  const accepted = page.waitForResponse((response) => /\/api\/ai\/assist\/[^/]+\/accept$/.test(response.url()) && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '应用所选建议' }).click();
  expect((await accepted).status()).toBe(201);
  await expect(dialog).toBeHidden();
  await expect(source).not.toHaveValue(original);
  await expect(page.getByText(/已应用 AI 建议.*原始版本仍保留/)).toBeVisible();
  await expectNamedInteractiveControls(page);
});

test('AI 歌词工作室可独立润色，并在确认前保留编辑器原文', async ({ page }, testInfo) => {
  await loginAsDevelopmentUser(page, testInfo);
  const catalog = await (await page.request.get('/api/catalog/ai-operations')).json() as Array<{ action: string; previewExecutable: boolean; estimatedCredits: number | null; priceVersion: string | null }>;
  expect(catalog.find((entry) => entry.action === 'lyrics.continue')).toMatchObject({ previewExecutable: true, estimatedCredits: 1 });
  expect(catalog.find((entry) => entry.action === 'lyrics.continue')?.priceVersion).toBeTruthy();
  await navigateWorkspace(page, 'AI 歌词工作室');
  const original = '[Verse]\n雨落在旧站台\n我仍等着末班车';
  const lyrics = page.getByRole('textbox', { name: '歌词', exact: true });
  await lyrics.fill(original);
  await page.getByRole('button', { name: /续写段落/ }).click();

  const dialog = page.getByRole('dialog', { name: 'AI 创作伙伴' });
  await expect(dialog.getByRole('textbox', { name: '原始内容 / 创作要求' })).toHaveValue(original);
  await dialog.getByRole('button', { name: '生成建议' }).click();
  await expect(dialog.getByRole('heading', { name: '建议版本' })).toBeVisible();
  await expect(lyrics).toHaveValue(original);
  const accepted = page.waitForResponse((response) => /\/api\/ai\/assist\/[^/]+\/accept$/.test(response.url()) && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '应用所选建议' }).click();
  expect((await accepted).status()).toBe(201);
  await expect(lyrics).not.toHaveValue(original);
  await expect(page.getByText(/已应用 AI 建议.*原始版本仍保留/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '本地草稿' })).toBeVisible();
  await expect(page.getByText(/尚未手动保存.*保存到此设备/)).toBeVisible();
  await expectNamedInteractiveControls(page);
});

test('作品、任务、账单与只读模型连接可跨页面访问', async ({ page }, testInfo) => {
  await loginAsDevelopmentUser(page, testInfo);

  await navigateWorkspace(page, '作品库');
  await expect(page.getByRole('textbox', { name: '搜索作品' })).toBeVisible();
  await expectNamedInteractiveControls(page);
  await expectNoHorizontalOverflow(page);

  await navigateWorkspace(page, '任务中心');
  await expect(page.getByText(/^任务状态以服务端记录为准/)).toBeVisible();
  await expect(page.getByText(/实时事件已连接|轮询刷新/)).toBeVisible();
  await expectNamedInteractiveControls(page);
  await expectNoHorizontalOverflow(page);

  await navigateWorkspace(page, '积分与订单');
  await expect(page.getByText('积分包与订阅由 ModelCross 实时提供')).toBeVisible();
  await expect(page.getByRole('button', { name: /充值积分|选择积分包/ })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/¥\s*(?:29|99|259)/);
  const topUpTrigger = page.getByRole('button', { name: '前往 ModelCross 充值' });
  await topUpTrigger.click();
  const topUpDialog = page.getByRole('dialog', { name: '前往统一钱包充值' });
  await expect(topUpDialog).toBeVisible();
  await expect(topUpDialog.getByRole('link', { name: '新标签页打开' })).toHaveAttribute('target', '_blank');
  await expect(topUpDialog.getByRole('link', { name: '新标签页打开' })).toHaveAttribute('rel', 'noopener noreferrer');
  await page.keyboard.press('Escape');
  await expect(topUpDialog).toHaveCount(0);
  await expect(topUpTrigger).toBeFocused();
  await page.getByText('积分接口与参数边界').click();
  await expect(page.getByText('GET /api/v2/points/balance')).toBeVisible();
  await expect(page.getByText(/没有 Path、Query 或 Body 参数/)).toBeVisible();
  await expectNamedInteractiveControls(page);
  await expectNoHorizontalOverflow(page);

  await navigateWorkspace(page, '设置');
  await expect(page.getByText('统一账户', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创作偏好', exact: true }).click();
  await expect(page.getByRole('heading', { name: '界面主题' })).toBeVisible();
  await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '模型连接', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ModelCross 托管的 Provider 与账户授权' })).toBeVisible();
  await expect(page.getByText('只读', { exact: true })).toBeVisible();
  await expect(page.getByText(/永久 Provider 凭证和上游路由仅存在于 ModelCross 控制面/)).toBeVisible();
  await expect(page.getByText(/MuseFlow 使用短期且限定操作、模型与资源范围的 task token/)).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expectNamedInteractiveControls(page);
  await expectNoHorizontalOverflow(page);
});

test('深浅主题持久化，并支持键盘跳转和对话框关闭', async ({ page }, testInfo) => {
  await page.goto('/');
  if (await page.locator('html').getAttribute('data-theme') !== 'dark')
    await page.evaluate(() => localStorage.setItem('museflow.theme.v1', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const skipLink = page.getByRole('link', { name: '跳到主要内容' });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.getByRole('main')).toBeFocused();

  await loginAsDevelopmentUser(page, testInfo);
  await navigateWorkspace(page, '项目与专辑');
  await page.getByRole('button', { name: '新建项目', exact: true }).first().focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '新建音乐项目' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: '项目名称' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('main')).toBeVisible();
  await expectNamedInteractiveControls(page);
  await expectNoHorizontalOverflow(page);

  if ((page.viewportSize()?.width || 0) < 1024) {
    const menuButton = page.getByRole('button', { name: '打开主导航' });
    const sidebar = page.locator('#app-sidebar');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(sidebar).toHaveAttribute('inert', '');
    await menuButton.focus();
    await page.keyboard.press('Shift+Tab');
    expect(await sidebar.evaluate((element) => element.contains(document.activeElement))).toBe(false);
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('button', { name: '关闭导航' })).toBeFocused();
    const firstSidebarButton = sidebar.getByRole('button', { name: 'MuseFlow 创作首页' });
    await sidebar.getByRole('button', { name: '查看账户与积分' }).focus();
    await page.keyboard.press('Tab');
    await expect(firstSidebarButton).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');

    await menuButton.click();
    await page.getByRole('button', { name: '关闭导航遮罩' }).click({ position: { x: 380, y: 400 } });
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await sidebar.getByRole('button', { name: '关闭导航' }).click();
    await expect(menuButton).toBeFocused();
    await expect.poll(async () => (await sidebar.boundingBox())?.x ?? 0).toBeLessThan(0);
  }
});

test('1280 宽浅色工作台保持清晰层级、无严重可访问性问题和横向溢出', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '桌面中等宽度专项');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined }));
  await page.addInitScript(() => localStorage.setItem('museflow.theme.v1', 'dark'));
  const account = {
    balance: 500, availableBalance: 500, reservedBalance: 0, currency: 'credits',
    subscription: { name: '按量使用', status: 'inactive', renewsAt: null, includedCredits: 0 },
    topUpUrl: 'https://modelcross.example/topup', ordersUrl: 'https://modelcross.example/orders', accountUrl: 'https://modelcross.example/account',
  };
  const model = {
    id: 'chirp-fenix', displayName: 'Suno V5.5', provider: 'ModelCross Music Gateway', description: '旗舰品质，细腻人声与复杂编曲表现最佳。', badge: '推荐', enabled: true,
    estimatedCredits: { generatePair: 320, extendPair: 320, coverPair: 320, remasterPair: 320 },
    capabilities: {
      simple: true, custom: true, instrumental: true, negativeTags: true, vocalGender: true,
      styleWeight: { min: 0, max: 1, step: 0.01, default: 0.65 }, weirdness: { min: 0, max: 1, step: 0.01, default: 0.5 },
      operations: ['generate', 'extend', 'cover', 'remaster'], maxTitleLength: 100, maxDescriptionLength: 1000,
      maxStyleLength: 1000, maxLyricsLength: 5000, maxNegativeTagsLength: 1000,
    },
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/session': { authenticated: true, user: { id: 'visual-user', subject: 'visual-user', name: '视觉验收用户', email: 'visual@example.test', role: 'user' }, account },
      '/api/health': { provider: 'ModelCross Music Gateway', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: null, billingLive: false, models: [model.id] },
      '/api/library': [], '/api/catalog/music-models': [model], '/api/catalog/ai-operations': [], '/api/projects': [], '/api/tasks': [], '/api/billing/orders': [],
      '/api/catalog/music-operations': [{ action: 'generate', operationCode: 'generation_pair', available: true, estimatedCredits: 320, priceVersion: 'visual-price-v1', chargingEnabled: false, preview: true, executable: true, previewExecutable: true, parameters: null }],
      '/api/billing/summary': { account, monthSpent: 0, monthGeneratedTracks: 0, pendingReservations: 0 },
    };
    await route.fulfill({ status: path in responses ? 200 : 404, contentType: 'application/json', body: JSON.stringify(responses[path] ?? { error: `unhandled ${path}` }) });
  });
  await page.goto('/#/create');
  await expect(page.getByRole('heading', { name: '创作工作台', exact: true })).toBeVisible();
  const themeToggle = page.getByRole('button', { name: /浅色模式|深色模式/ });
  if (await page.locator('html').getAttribute('data-theme') !== 'light') await themeToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const advanced = page.getByRole('button', { name: /人声与高级参数/ });
  await expect(advanced).toHaveAttribute('aria-expanded', 'false');
  await expect(advanced).toContainText(/声线|风格/);

  const layout = await page.locator('.creation-grid').evaluate((grid) => {
    const left = grid.querySelector<HTMLElement>('.creation-left')?.getBoundingClientRect();
    const right = grid.querySelector<HTMLElement>('.creation-right')?.getBoundingClientRect();
    const results = grid.querySelector<HTMLElement>('.creation-results')?.getBoundingClientRect();
    return left && right && results ? {
      left: { x: left.x, y: left.y, width: left.width, bottom: left.bottom },
      right: { x: right.x, y: right.y, width: right.width, bottom: right.bottom },
      results: { x: results.x, y: results.y, width: results.width },
    } : null;
  });
  expect(layout).not.toBeNull();
  const columnsAreSideBySide = Math.abs(Number(layout?.left.y) - Number(layout?.right.y)) <= 1;
  if (columnsAreSideBySide) {
    expect(Number(layout?.left.width)).toBeGreaterThanOrEqual(360);
    expect(Number(layout?.right.width)).toBeGreaterThanOrEqual(360);
  } else {
    expect(Number(layout?.right.y)).toBeGreaterThanOrEqual(Number(layout?.left.bottom) - 1);
  }
  expect(Number(layout?.results.y)).toBeGreaterThanOrEqual(Math.max(Number(layout?.left.bottom), Number(layout?.right.bottom)) - 1);
  if (columnsAreSideBySide)
    expect(Number(layout?.results.width)).toBeGreaterThan(Number(layout?.left.width));

  await expectNamedInteractiveControls(page);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
});

test('390px 工作台先完成模型配置再进入结果区', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390-chromium', '移动端信息顺序专项');
  await page.addInitScript(() => localStorage.setItem('museflow.theme.v1', 'light'));
  await loginAsDevelopmentUser(page, testInfo);

  const layout = await page.locator('.creation-grid').evaluate((grid) => {
    const left = grid.querySelector<HTMLElement>('.creation-left')?.getBoundingClientRect();
    const right = grid.querySelector<HTMLElement>('.creation-right')?.getBoundingClientRect();
    const results = grid.querySelector<HTMLElement>('.creation-results')?.getBoundingClientRect();
    return left && right && results ? {
      left: { top: left.top, bottom: left.bottom },
      right: { top: right.top, bottom: right.bottom },
      results: { top: results.top },
    } : null;
  });

  expect(layout).not.toBeNull();
  expect(Number(layout?.right.top)).toBeGreaterThanOrEqual(Number(layout?.left.bottom) - 1);
  expect(Number(layout?.results.top)).toBeGreaterThanOrEqual(Number(layout?.right.bottom) - 1);
  await expect(page.getByRole('button', { name: /人声与高级参数/ })).toHaveAttribute('aria-expanded', 'false');
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
});

test('退出登录返回 Landing，刷新后会话仍撤销且私有 API 返回 401', async ({ page }, testInfo) => {
  await loginAsDevelopmentUser(page, testInfo);
  await page.getByRole('banner').getByRole('button', { name: /打开账户菜单/ }).click();
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: /让每一个想法/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /让每一个想法/ })).toBeVisible();
  const session = await (await page.request.get('/api/session')).json() as { authenticated: boolean };
  expect(session.authenticated).toBe(false);
  expect((await page.request.get('/api/projects')).status()).toBe(401);
  await expectNamedInteractiveControls(page);
});

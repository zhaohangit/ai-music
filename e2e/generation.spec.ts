import { expect, expectNoHorizontalOverflow, expectNoSeriousAxeViolations, loginAsDevelopmentUser, navigateWorkspace, test } from './fixtures';

test('fake provider 双 Track 生成、轮询、播放入口与私有资源 Range', async ({ page }, testInfo) => {
  const generationTimeout = Number(process.env.E2E_GENERATION_TIMEOUT_MS || 120_000);
  test.setTimeout(generationTimeout + 45_000);
  test.skip(process.env.E2E_FAKE_PROVIDER !== 'true', '安全门禁：只有显式声明 fake provider 才允许提交生成，避免消耗真实积分或 API。');

  const healthResponse = await page.request.get('/api/health');
  expect(healthResponse.ok()).toBeTruthy();
  const health = await healthResponse.json() as {
    configured?: boolean;
    ready?: boolean;
    billingLive?: boolean;
    musicMutationsExecutable?: boolean;
    preview?: boolean;
  };
  test.skip(!health.configured || !health.ready, 'fake provider 未就绪，不伪造生成成功。');
  expect(health.billingLive, '安全门禁：生成 E2E 只允许在不实扣积分的 billing preview 模式运行。').toBe(false);
  expect(health.preview, '服务端未明确启用 development fake preview；测试不会尝试提交生成。').toBe(true);
  expect(health.musicMutationsExecutable, '服务端音乐 mutation 门禁未开放；测试不会等待页面按钮超时。').toBe(true);

  await loginAsDevelopmentUser(page, testInfo);
  await page.getByRole('textbox', { name: '描述你的音乐' }).fill('E2E fake provider：短小的器乐氛围音乐，柔和钢琴与雨声。');
  const submit = page.getByRole('button', { name: /生成 2 首歌曲/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText(/已提交 2 个创作任务.*安全预览.*不会实扣积分/)).toBeVisible();

  await navigateWorkspace(page, '作品库');
  // ProgressDetail renders the full stage list, including the future "已完成"
  // label while a track is still saving. Treat the enabled card playback control
  // as the user-visible completion contract instead of matching that stage text.
  const completed = page.getByRole('article', { name: /^作品 / }).filter({
    // Keep the locator stable after playback begins and the first button changes
    // its accessible name from "播放" to "暂停".
    has: page.getByRole('button', { name: /^(播放|暂停)$/ }),
  });
  await expect(completed).toHaveCount(2, { timeout: generationTimeout });

  const first = completed.first();
  await first.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', /\/api\/tracks\/[^/]+\/audio/);

  const href = await first.getByRole('link', { name: '下载 MP3' }).getAttribute('href');
  expect(href).toMatch(/^\/api\/tracks\/[^/]+\/audio\?download=1$/);
  const audioPath = href!.replace(/\?download=1$/, '');
  const range = await page.request.get(audioPath, { headers: { Range: 'bytes=0-31' } });
  expect(range.status()).toBe(206);
  expect(range.headers()['accept-ranges']).toBe('bytes');
  expect(range.headers()['content-range']).toMatch(/^bytes 0-31\/\d+$/);
  expect((await range.body()).byteLength).toBe(32);

  page.once('dialog', (dialog) => dialog.accept());
  const deletedTrackLabel = await first.getAttribute('aria-label');
  expect(deletedTrackLabel).toBeTruthy();
  const deleted = page.waitForResponse((response) => response.url().includes(audioPath.replace('/audio', '')) && response.request().method() === 'DELETE');
  await first.getByRole('button', { name: '删除', exact: true }).click();
  expect((await deleted).ok()).toBeTruthy();
  await expect(page.getByRole('article', { name: deletedTrackLabel!, exact: true })).toHaveCount(0);
  await expect(completed).toHaveCount(1);
  expect((await page.request.get(audioPath)).status()).toBe(404);
});

test('fake provider 双 Sound Track 使用精确参数并完成私有对象存储全链路', async ({ page }, testInfo) => {
  const generationTimeout = Number(process.env.E2E_GENERATION_TIMEOUT_MS || 120_000);
  test.setTimeout(generationTimeout + 60_000);
  test.skip(process.env.E2E_FAKE_PROVIDER !== 'true', '安全门禁：只有显式声明 fake provider 才允许提交音效生成。');

  const healthResponse = await page.request.get('/api/health');
  expect(healthResponse.ok()).toBeTruthy();
  const health = await healthResponse.json() as {
    configured?: boolean;
    ready?: boolean;
    billingLive?: boolean;
    musicMutationsExecutable?: boolean;
    preview?: boolean;
  };
  test.skip(!health.configured || !health.ready, 'fake provider 未就绪，不伪造音效生成成功。');
  expect(health.billingLive, '安全门禁：Sound E2E 只允许在不实扣积分的 billing preview 模式运行。').toBe(false);
  expect(health.preview, '服务端未明确启用 development fake preview；测试不会提交 Sound。').toBe(true);
  expect(health.musicMutationsExecutable, '服务端音乐 mutation 门禁未开放；测试不会等待 Sound 按钮超时。').toBe(true);

  await loginAsDevelopmentUser(page, testInfo);
  await page.getByRole('tab', { name: '音效' }).click();
  await page.getByRole('textbox', { name: /音效标题/ }).fill('E2E 雨夜循环音效');
  await page.getByRole('textbox', { name: /音效风格与描述/ }).fill('steady rain ambience, window reflections, seamless cinematic bed');
  await page.getByRole('button', { name: /音效参数/ }).click();
  await page.getByRole('spinbutton', { name: /BPM/ }).fill('118.5');
  await page.getByRole('textbox', { name: /调性/ }).fill('F# minor');
  await page.getByRole('checkbox', { name: '无缝循环' }).uncheck({ force: true });
  const submit = page.getByRole('button', { name: /生成 2 个音效 · \d+(?:\.\d+)? 积分/ });
  await expect(submit).toBeEnabled();
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);
  await submit.click();
  await expect(page.getByText(/已提交 2 个音效任务.*安全预览.*不会实扣积分|音效生成请求已受理.*安全预览.*不会实扣积分/)).toBeVisible();

  await navigateWorkspace(page, '作品库');
  type SoundTrack = {
    id: string;
    title: string;
    operation: string;
    status: string;
    soundTempo?: number | null;
    soundKey?: string | null;
    soundLoop?: boolean | null;
    audioUrl?: string | null;
  };
  await expect.poll(async () => {
    const response = await page.request.get('/api/library');
    if (!response.ok()) return 0;
    const tracks = await response.json() as SoundTrack[];
    return tracks.filter((track) => track.operation === 'sound' && track.status === 'done' && track.audioUrl).length;
  }, { timeout: generationTimeout, message: '两个 Sound Track 都应完成并保存私有音频资产' }).toBe(2);

  const libraryResponse = await page.request.get('/api/library');
  expect(libraryResponse.ok()).toBeTruthy();
  const soundTracks = (await libraryResponse.json() as SoundTrack[])
    .filter((track) => track.operation === 'sound' && track.status === 'done');
  expect(soundTracks).toHaveLength(2);
  for (const track of soundTracks) {
    expect(track).toMatchObject({ soundTempo: 118.5, soundKey: 'F# minor', soundLoop: false });
    const audioPath = `/api/tracks/${track.id}/audio`;
    const range = await page.request.get(audioPath, { headers: { Range: 'bytes=0-63' } });
    expect(range.status(), `${track.id} 的私有 MP3 应支持 Range`).toBe(206);
    expect(range.headers()['accept-ranges']).toBe('bytes');
    expect(range.headers()['content-range']).toMatch(/^bytes 0-63\/\d+$/);
    expect((await range.body()).byteLength).toBe(64);
    const cover = await page.request.get(`/api/tracks/${track.id}/cover`);
    expect(cover.status(), `${track.id} 的封面也应已进入私有对象存储`).toBe(200);
    expect(cover.headers()['content-type']).toMatch(/^image\/png/);
  }

  const completed = page.getByRole('article', { name: /^作品 / }).filter({
    has: page.getByRole('button', { name: /^(播放|暂停)$/ }),
  });
  await expect(completed).toHaveCount(2, { timeout: generationTimeout });
  for (const track of soundTracks) {
    const card = page.getByRole('article', { name: `作品 ${track.title}`, exact: true });
    await expect(card.getByRole('link', { name: '下载 MP3' })).toHaveAttribute('href', `/api/tracks/${track.id}/audio?download=1`);
    await card.getByRole('button', { name: '播放', exact: true }).click();
    await expect(page.locator('audio')).toHaveAttribute('src', new RegExp(`/api/tracks/${track.id}/audio$`));
  }
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);

  for (const track of soundTracks) {
    const card = page.getByRole('article', { name: `作品 ${track.title}`, exact: true });
    page.once('dialog', (dialog) => dialog.accept());
    const deleted = page.waitForResponse((response) => response.url().endsWith(`/api/tracks/${track.id}`) && response.request().method() === 'DELETE');
    await card.getByRole('button', { name: '删除', exact: true }).click();
    expect((await deleted).ok()).toBeTruthy();
    await expect(card).toHaveCount(0);
    expect((await page.request.get(`/api/tracks/${track.id}/audio`)).status()).toBe(404);
    expect((await page.request.get(`/api/tracks/${track.id}/cover`)).status()).toBe(404);
  }
  await expect(completed).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

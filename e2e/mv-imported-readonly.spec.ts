import { test, expect, expectNoHorizontalOverflow, expectNoSeriousAxeViolations } from './fixtures';

test('imported MV persists, plays, seeks, downloads privately and links to its song', async ({page},testInfo)=>{
  test.skip(process.env.E2E_MV_IMPORTED!=='true','Requires the local imported deliverable. Never submits generation.');
  const auth=await page.request.post('/api/auth/dev-login',{data:{subject:'dev-user-1',name:'Local AI Test',admin:true}});expect(auth.ok()).toBe(true);
  await page.route('**/api/mv/projects/*/generate',r=>r.abort());
  await page.goto('/#/mv');
  await page.getByRole('button',{name:/项目记录/}).click();
  await page.getByRole('button',{name:/嫩绿的回信.*人物动态版/}).click();
  const video=page.locator('.mv-preview video');await expect(video).toBeVisible();
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThan(0);
  const duration=await video.evaluate((v:HTMLVideoElement)=>v.duration);expect(duration).toBeCloseTo(289.584,1);
  await video.evaluate((v:HTMLVideoElement)=>{v.currentTime=55;});
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>!v.seeking&&v.readyState>=2)).toBe(true);
  await video.evaluate(async(v:HTMLVideoElement)=>{v.muted=true;await v.play();});
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(55.15);
  await video.evaluate((v:HTMLVideoElement)=>v.pause());
  await expect(page.getByRole('link',{name:'下载 MV',exact:true})).toBeVisible();
  const download=await page.getByRole('link',{name:'下载 MV',exact:true}).getAttribute('href');
  const response=await page.request.get(download!,{headers:{Range:'bytes=0-31'}});expect(response.status()).toBe(206);expect(response.headers()['content-type']).toContain('video/mp4');expect((await response.body()).length).toBe(32);
  const srt=await page.getByRole('link',{name:'下载 SRT 字幕',exact:true}).getAttribute('href');expect((await page.request.get(srt!)).status()).toBe(200);
  await expectNoHorizontalOverflow(page);await expectNoSeriousAxeViolations(page);
  await page.screenshot({path:`artifacts/mv-verification/${testInfo.project.name}-completed.png`,fullPage:true});
  const list=await (await page.request.get('/api/library')).json();expect(list.find((t:any)=>t.id==='c8208946-7cf8-4c4b-8b30-873ce3de6fed').videoUrl).toBeTruthy();
});

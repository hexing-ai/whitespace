import { test, expect, type Page } from '@playwright/test';
async function progress(page: Page, value: number) { await page.locator('.cinematic-home').evaluate((el,p)=>scrollTo(0,p*(el.clientHeight-innerHeight)),value); }

test('prepared frames restore the complete timeline without MP4 or video workers and release GPU images',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.addInitScript(()=>{
  let live=0,peak=0;const create=window.createImageBitmap;
  window.createImageBitmap=(async(...args:unknown[])=>{const b=await Reflect.apply(create,window,args) as ImageBitmap;live++;peak=Math.max(peak,live);const update=()=>Object.assign(document.documentElement.dataset,{liveBitmaps:String(live),peakBitmaps:String(peak)});update();const close=b.close.bind(b);let open=true;b.close=()=>{if(open){open=false;live--;update();}close();};return b;}) as typeof createImageBitmap;
 });
 const resources:string[]=[],errors:string[]=[];let workers=0;
 page.on('request',r=>resources.push(r.url()));page.on('worker',()=>workers++);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const home=page.locator('.cinematic-home'),canvas=page.locator('.home-canvas');
 await expect(home).toHaveAttribute('data-renderer','canvas');
 await expect(home).toHaveAttribute('data-bank-frames','241');
 await page.waitForTimeout(500);
 expect(resources.filter(u=>u.includes('/media/frames/')).length).toBeLessThanOrEqual(17);
 expect(resources.filter(u=>u.includes('.mp4'))).toEqual([]);expect(workers).toBe(0);
 for(const p of [.45,.9,.1,1,0]){await progress(page,p);await expect.poll(()=>canvas.evaluate((el,p)=>Math.abs(Number(el.dataset.time)-p*10.041667),p)).toBeLessThan(.05);}
 expect(Number(await page.locator('html').getAttribute('data-peak-bitmaps'))).toBeLessThanOrEqual(24);
 await page.locator('.home-plan-entry').click();
 await expect(page.locator('html')).toHaveAttribute('data-live-bitmaps','0');expect(errors).toEqual([]);
});

for(const mode of ['reduced','touch','narrow','unsupported'] as const)test(`${mode} reads normally without downloading animation frames`,async({browser})=>{
 const context=await browser.newContext({viewport:mode==='narrow'?{width:390,height:844}:{width:1440,height:900},hasTouch:mode==='touch',reducedMotion:mode==='reduced'?'reduce':'no-preference'});
 const page=await context.newPage();if(mode==='unsupported')await page.addInitScript(()=>{Reflect.deleteProperty(window,'createImageBitmap');});
 const resources:string[]=[];page.on('request',r=>{if(/\.mp4|\/media\/frames\//.test(r.url()))resources.push(r.url());});
 await page.goto('/');await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode','static');
 await page.getByRole('button',{name:'向下了解'}).click();await page.getByRole('button',{name:'了解如何开始'}).click();await page.getByRole('button',{name:'用示例体验'}).click();
 await expect(page.getByLabel('人数',{exact:true})).toHaveValue('5');expect(resources).toEqual([]);await context.close();
});

test('slow initial frames show the poster and leave planning immediately usable',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.route('**/media/frames/**',()=>{});
 await page.goto('/');await expect(page.locator('.cinematic-home')).toHaveAttribute('data-renderer','poster');
 await page.locator('.home-plan-entry').click();await expect(page.getByLabel('成功标准',{exact:true})).toBeVisible();
});

test('missing frames restore readable content and all navigation',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.route('**/media/frames/**',r=>r.fulfill({status:404,body:''}));
 await page.goto('/');await expect(page.locator('.cinematic-home')).toHaveAttribute('data-video-state','unavailable');
 await expect(page.locator('.home-chapter[inert]')).toHaveCount(0);await page.getByRole('button',{name:'用示例体验'}).click();await expect(page.getByLabel('人数',{exact:true})).toHaveValue('5');
});

test('stalled frame download falls back within five seconds',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.route('**/media/frames/**',()=>{});await page.clock.install();
 await page.goto('/');await expect(page.locator('.cinematic-home')).toHaveAttribute('data-video-state','loading');
 await page.clock.fastForward(5001);await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode','static');
 await page.getByRole('button',{name:'用示例体验'}).click();await expect(page.getByLabel('人数',{exact:true})).toHaveValue('5');
});

test('reduced motion changed during the story releases frames and preserves reading position',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await expect(page.locator('.cinematic-home')).toHaveAttribute('data-renderer','canvas');
 await progress(page,.9);await expect(page.locator('.cinematic-home')).toHaveAttribute('data-chapter','3');await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode','static');await expect(page.locator('.home-chapter[inert]')).toHaveCount(0);
 await page.getByRole('button',{name:'用示例体验'}).click();await expect(page.getByLabel('人数',{exact:true})).toHaveValue('5');
});

test('skip preference does not load the home animation',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('whitespace:skip-intro:v1','true'));const resources:string[]=[];
 page.on('request',r=>{if(/\.mp4|\/media\/frames\/|whitespace-mountains|hero-ink|features_home/.test(r.url()))resources.push(r.url());});
 await page.goto('/');await expect(page.getByLabel('成功标准',{exact:true})).toBeVisible();expect(resources).toEqual([]);
});

test('slow frame downloads fall back instead of continuing to stutter',async({page,context})=>{
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:100000});
 await page.setViewportSize({width:1440,height:900});const frames:string[]=[];
 page.on('request',r=>{if(r.url().includes('/media/frames/'))frames.push(r.url());});
 await page.goto('/');await expect(page.locator('.cinematic-home')).toHaveAttribute('data-video-state','unavailable',{timeout:6000});await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode','static');
 await page.getByRole('button',{name:'用示例体验'}).click();await expect(page.getByLabel('人数',{exact:true})).toHaveValue('5');expect(frames.length).toBeLessThanOrEqual(8);
});

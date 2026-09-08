import { test, expect, type Page } from '@playwright/test';
async function progress(page: Page, value: number) { await page.locator('.cinematic-home').evaluate((el, p) => scrollTo(0, p * (el.clientHeight - innerHeight)), value); }

for (const width of [390, 768, 1280, 1440]) test(`${width}px: original scenery behind continuous document flow`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [], videos: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (r.url().includes('.mp4')) videos.push(r.url()); });
  await page.goto('/'); await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode', 'natural');
  const layout = await page.locator('.home-chapter').evaluateAll(elements => elements.map(el => {
    const box = el.getBoundingClientRect(), css = getComputedStyle(el);
    return { top: box.top + scrollY, bottom: box.bottom + scrollY, position: css.position, opacity: css.opacity, minHeight: css.minHeight };
  }));
  expect(layout).toHaveLength(3);
  for (let i = 0; i < layout.length; i++) {
    expect(layout[i].position).toBe('relative'); expect(layout[i].opacity).toBe('1');
    if (i) { expect(layout[i].top).toBeCloseTo(layout[i - 1].bottom); expect(layout[i].minHeight).toBe('0px'); }
  }
  expect(await page.locator('.home-landscape').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('whitespace-mountains.webp');
  await page.mouse.wheel(0, 410);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  for (const delta of [630, -380, 960, -1620]) {
    await page.mouse.wheel(0, delta); await page.waitForTimeout(150);
    await expect(page.locator('.home-plan-entry')).toBeInViewport();
    expect(await page.locator('.home-chapter').evaluateAll(els => els.every(el => !el.hasAttribute('inert') && getComputedStyle(el).opacity === '1'))).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '向下了解', exact: true }).click(); await expect(page.locator('#home-value-title')).toBeInViewport();
  await page.getByRole('button', { name: '了解如何开始', exact: true }).click(); await expect(page.locator('#home-action-title')).toBeInViewport();
  await expect(page.locator('.home-nav-links [data-chapter-link="2"]')).toHaveAttribute('aria-current', 'location');
  await page.getByRole('button', { name: '用示例体验', exact: true }).click(); await expect(page.getByLabel('人数', { exact: true })).toHaveValue('5');
  await expect(page.locator('.home-landscape')).toHaveCount(0); expect(videos).toEqual([]); expect(errors).toEqual([]);
});

test('scroll changes the original frame and foreground contrast without moving the document layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/');
  const home = page.locator('.cinematic-home'), canvas = page.locator('.home-canvas');
  await expect(home).toHaveAttribute('data-landscape', 'ready');
  const height = await home.evaluate(el => el.clientHeight);
  for (const [p, frame, light] of [[.5, 120, 'false'], [1, 240, 'true'], [0, 0, 'false']] as const) {
    await progress(page, p);
    await expect.poll(() => canvas.getAttribute('data-frame')).toBe(String(frame));
    await expect(home).toHaveAttribute('data-light', light);
    expect(await home.evaluate(el => el.clientHeight)).toBe(height);
    expect(await page.locator('.home-chapter').evaluateAll(els => els.every(el => getComputedStyle(el).opacity === '1'))).toBe(true);
  }
  expect(await page.locator('.home-landscape').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  expect(await page.locator('.home-brand h1').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const s = getSelection()!; s.removeAllRanges(); s.addRange(range); return s.toString(); })).toContain('留白');
});

for (const mode of ['reduced', 'touch', 'unsupported'] as const) test(`${mode}: original poster and full scrolling work without frame downloads`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: mode === 'touch', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
  const page = await context.newPage(); if (mode === 'unsupported') await page.addInitScript(() => { Reflect.deleteProperty(window, 'createImageBitmap'); });
  const frames: string[] = []; page.on('request', r => { if (r.url().includes('/media/frames/')) frames.push(r.url()); });
  await page.goto('/'); await expect(page.locator('.cinematic-home')).toHaveAttribute('data-landscape', 'static');
  await progress(page, 1); await expect(page.locator('#home-action-title')).toBeInViewport();
  await page.locator('.home-plan-entry').click(); await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible();
  expect(frames).toEqual([]); await context.close();
});

test('blocked background loading never blocks native scrolling or planning', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.route('**/media/frames/**', () => {});
  await page.goto('/'); await expect(page.locator('.home-brand h1')).toBeVisible();
  await page.mouse.wheel(0, 600); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  await progress(page, 1); await expect(page.locator('#home-action-title')).toBeInViewport();
  await page.locator('.home-plan-entry').click(); await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible();
});

test('failed frames preserve scroll position, original poster and visible document', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.route('**/media/frames/**', r => r.fulfill({ status: 404, body: '' }));
  await page.goto('/'); await expect(page.locator('.cinematic-home')).toHaveAttribute('data-landscape', 'unavailable');
  await progress(page, .6); const y = await page.evaluate(() => scrollY); await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBe(y); await expect(page.locator('.home-chapter[inert]')).toHaveCount(0);
  await page.locator('.home-plan-entry').click(); await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible();
});

test('motion preference switches without resetting reading position', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.home-brand h1')).toBeVisible(); await progress(page, .4);
  const before = await page.evaluate(() => scrollY); await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.cinematic-home')).toHaveAttribute('data-landscape', 'static'); expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('network estimates do not wake idle scenery; data-saving changes still apply', async ({ page }) => {
  await page.addInitScript(() => {
    const connection = Object.assign(new EventTarget(), { saveData: false, rafs: 0 });
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
    const original = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { connection.rafs++; return original(callback); };
  });
  await page.goto('/'); await expect(page.locator('.home-canvas')).toHaveAttribute('data-preview', 'ready');
  await progress(page, .4); const before = await page.evaluate(() => scrollY);
  const scheduled = await page.evaluate(() => {
    const connection = (navigator as Navigator & { connection: EventTarget & { saveData: boolean; rafs: number } }).connection;
    const before = connection.rafs;
    connection.dispatchEvent(new Event('change'));
    const scheduled = connection.rafs - before;
    connection.saveData = true; connection.dispatchEvent(new Event('change'));
    return scheduled;
  });
  expect(scheduled).toBe(0);
  await expect(page.locator('.cinematic-home')).toHaveAttribute('data-landscape', 'static');
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.evaluate(() => {
    const connection = (navigator as Navigator & { connection: EventTarget & { saveData: boolean } }).connection;
    connection.saveData = false; connection.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('.cinematic-home')).toHaveAttribute('data-landscape', 'ready');
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('skip intro does not load home scenery', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('whitespace:skip-intro:v1', 'true'));
  const requests: string[] = []; page.on('request', r => { if (/features_home|\/media\/|hero-ink/.test(r.url())) requests.push(r.url()); });
  await page.goto('/'); await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible(); expect(requests).toEqual([]);
});

test('bitmap cache stays bounded, hidden page pauses requests and exit closes all allocations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    let live = 0, peak = 0; const create = window.createImageBitmap;
    window.createImageBitmap = (async (...args: unknown[]) => {
      const bitmap = await Reflect.apply(create, window, args) as ImageBitmap; live++; peak = Math.max(peak, live);
      const update = () => Object.assign(document.documentElement.dataset, { live: String(live), peak: String(peak) }); update();
      const close = bitmap.close.bind(bitmap); let open = true; bitmap.close = () => { if (open) { open = false; live--; update(); } close(); }; return bitmap;
    }) as typeof createImageBitmap;
  });
  let requests = 0; page.on('request', r => { if (r.url().includes('/media/frames/')) requests++; });
  await page.goto('/'); await expect(page.locator('.cinematic-home')).toHaveAttribute('data-landscape', 'ready');
  for (const p of [.4, .9, .1, 1, 0]) { await progress(page, p); await page.waitForTimeout(100); }
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100); const count = requests; await progress(page, .6); await page.waitForTimeout(300); expect(requests).toBe(count);
  await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.locator('.home-canvas').getAttribute('data-frame')).toBe('144');
  expect(Number(await page.locator('html').getAttribute('data-peak'))).toBeLessThanOrEqual(24);
  await page.locator('.home-plan-entry').click(); await expect(page.locator('html')).toHaveAttribute('data-live', '0');
});

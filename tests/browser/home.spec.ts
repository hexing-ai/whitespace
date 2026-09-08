import { test, expect } from '@playwright/test';

for (const width of [390, 768, 1280, 1440]) test(`${width}px: natural continuous flow, readable content and no media downloads`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const media: string[] = [], errors: string[] = [];
  page.on('request', r => { if (/\.(mp4|webp)(\?|$)|\/media\/frames\//.test(r.url())) media.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode', 'natural');
  const layout = await page.locator('.home-chapter').evaluateAll(elements => elements.map(el => {
    const box = el.getBoundingClientRect(), css = getComputedStyle(el);
    return { top: box.top + scrollY, bottom: box.bottom + scrollY, position: css.position, opacity: css.opacity, minHeight: css.minHeight };
  }));
  expect(layout).toHaveLength(3);
  for (let i = 0; i < layout.length; i++) {
    expect(layout[i].position).toBe('relative'); expect(layout[i].opacity).toBe('1');
    if (i) { expect(layout[i].top).toBeCloseTo(layout[i - 1].bottom); expect(layout[i].minHeight).toBe('0px'); }
  }
  // Fast native wheel input must move the document, not a pinned chapter timeline.
  for (const delta of [410, 630, -380, 960, -1620]) {
    await page.mouse.wheel(0, delta); await page.waitForTimeout(150);
    await expect(page.locator('.home-plan-entry')).toBeInViewport();
    expect(await page.locator('.home-chapter').evaluateAll(els => els.every(el => !el.hasAttribute('inert') && getComputedStyle(el).opacity === '1'))).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '向下了解', exact: true }).click();
  await expect(page.locator('#home-value-title')).toBeInViewport();
  await page.getByRole('button', { name: '了解如何开始', exact: true }).click();
  await expect(page.locator('#home-action-title')).toBeInViewport();
  await expect(page.locator('.home-nav-links [data-chapter-link="2"]')).toHaveAttribute('aria-current', 'location');
  await page.getByRole('button', { name: '用示例体验', exact: true }).click();
  await expect(page.getByLabel('人数', { exact: true })).toHaveValue('5');
  await expect(page.locator('.home-atmosphere')).toHaveCount(0);
  expect(media).toEqual([]); expect(errors).toEqual([]);
});

test('background is decorative, pauses offscreen and cleans up on exit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const atmosphere = page.locator('.home-atmosphere'), fog = page.locator('.home-fog').first();
  await expect(atmosphere).toHaveAttribute('data-active', 'true');
  expect(await atmosphere.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect.poll(() => fog.evaluate(el => getComputedStyle(el).animationPlayState)).toBe('running');
  const first = await fog.evaluate(el => getComputedStyle(el).transform); await page.waitForTimeout(300);
  expect(await fog.evaluate(el => getComputedStyle(el).transform)).not.toBe(first);
  await page.locator('#home-action').scrollIntoViewIfNeeded();
  await expect(atmosphere).toHaveAttribute('data-active', 'false');
  await expect.poll(() => fog.evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused');
  await page.locator('#home-brand').scrollIntoViewIfNeeded();
  await expect(atmosphere).toHaveAttribute('data-active', 'true');
  // Native selection still works over the SVG and gradients.
  expect(await page.locator('.home-brand h1').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); return selection.toString(); })).toContain('留白');
  await page.locator('.home-plan-entry').click();
  expect(await page.evaluate(() => document.getAnimations().filter(a => (a.effect as KeyframeEffect)?.target instanceof Element && ((a.effect as KeyframeEffect).target as Element).matches('.home-fog')).length)).toBe(0);
});

for (const mode of ['reduced', 'touch', 'unsupported'] as const) test(`${mode}: background stays static and navigation works`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: mode === 'touch', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  if (mode === 'unsupported') await page.addInitScript(() => { Reflect.deleteProperty(window, 'IntersectionObserver'); });
  await page.goto('/'); await expect(page.locator('.home-brand h1')).toBeVisible();
  const fog = page.locator('.home-fog').first();
  if (mode === 'unsupported') await expect(page.locator('.home-atmosphere')).toHaveAttribute('data-active', 'false');
  else expect(await fog.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.locator('.home-plan-entry').click(); await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible();
  await context.close();
});

test('changing motion preference keeps reading position and disables animation', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.home-brand h1')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 240)); const before = await page.evaluate(() => scrollY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => scrollY)).toBe(before);
  expect(await page.locator('.home-fog').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('skip intro opens the workspace without loading the home component', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('whitespace:skip-intro:v1', 'true'));
  const homeRequests: string[] = [];
  page.on('request', r => { if (/features_home|\/media\/|hero-ink/.test(r.url())) homeRequests.push(r.url()); });
  await page.goto('/'); await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible();
  await expect(page.locator('.home-atmosphere')).toHaveCount(0); expect(homeRequests).toEqual([]);
});

test('hidden document pauses fog and visibility listener is removed on unmount', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
    const listeners = new Set();
    document.addEventListener = ((name: string, fn: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => { if (name === 'visibilitychange') listeners.add(fn); add(name, fn, options); }) as typeof document.addEventListener;
    document.removeEventListener = ((name: string, fn: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => { if (name === 'visibilitychange') listeners.delete(fn); remove(name, fn, options); }) as typeof document.removeEventListener;
    Object.defineProperty(window, '__visibilityListeners', { get: () => listeners.size });
  });
  await page.goto('/'); await expect(page.locator('.home-atmosphere')).toHaveAttribute('data-active', 'true');
  const count = await page.evaluate(() => Reflect.get(window, '__visibilityListeners'));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.home-atmosphere')).toHaveAttribute('data-active', 'false');
  await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.home-atmosphere')).toHaveAttribute('data-active', 'true');
  await page.locator('.home-plan-entry').click();
  expect(await page.evaluate(() => Reflect.get(window, '__visibilityListeners'))).toBe(count - 1);
});

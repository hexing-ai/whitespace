import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { attachOriginalVideo } from './original-video-fixture.mjs';

const directory = 'test-results/navigation-production';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = { time: new Date().toISOString(), passed: false, videoSource: 'live-CDN', layouts: [], errors: [], consoleErrors: [], fontLoaded: false, bank: null };
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  report.videoSource = await attachOriginalVideo(desktop.context());
  desktop.on('pageerror', e => report.errors.push(e.message));
  desktop.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  await desktop.goto('http://127.0.0.1:3100');
  const home = desktop.locator('.cinematic-home');
  await expect(home).toHaveAttribute('data-renderer', 'canvas', { timeout: 65000 });
  report.bank = await home.evaluate(el => ({ ...el.dataset }));
  await desktop.evaluate(() => document.fonts.ready);
  report.fontLoaded = await desktop.evaluate(() => document.fonts.status === 'loaded' && getComputedStyle(document.querySelector('.cinematic-home')).fontFamily.includes('Helvetica Neue'));
  for (const width of [1440, 1280, 1100]) {
    await desktop.setViewportSize({ width, height: 900 });
    for (const [chapter, progress] of [[1, 0], [2, .45], [3, .9]]) {
      await home.evaluate((el, p) => window.scrollTo(0, p * (el.clientHeight - innerHeight)), progress);
      await expect(home).toHaveAttribute('data-chapter', String(chapter));
      await expect.poll(() => desktop.locator('.home-canvas').evaluate((el, p) => Math.abs(Number(el.dataset.time) - p * 10.041667), progress)).toBeLessThan(.05);
      await desktop.waitForTimeout(950);
      await expect(desktop.locator('.home-plan-entry')).toBeInViewport();
      await expect(desktop.locator('.home-nav-links').getByRole('button', { name: '产品首页', exact: true })).toBeInViewport();
      expect(await desktop.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await desktop.screenshot({ path: `${directory}/${width}-scene-${chapter}.png` });
      report.layouts.push({ width, chapter, mode: 'canvas', passed: true });
    }
  }
  await desktop.getByRole('button', { name: '打开首页菜单', exact: true }).click();
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: `${directory}/desktop-menu.png` });
  await desktop.getByRole('dialog', { name: '首页菜单' }).getByRole('button', { name: '开始规划', exact: true }).click();
  await expect(desktop.getByLabel('成功标准', { exact: true })).toBeVisible();
  expect(await desktop.evaluate(() => document.body.style.overflow)).toBe('');
  await desktop.screenshot({ path: `${directory}/desktop-workspace.png`, fullPage: true });
  await desktop.getByRole('button', { name: '使用说明', exact: true }).click();
  await expect(desktop.getByRole('dialog')).toContainText('AI 识别目标');
  await desktop.keyboard.press('Escape');
  await desktop.close();
  for (const width of [768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    page.on('pageerror', e => report.errors.push(e.message));
    const videos = []; page.on('request', r => { if (r.url().includes('.mp4')) videos.push(r.url()); });
    await page.goto('http://127.0.0.1:3100');
    await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode', 'static');
    for (let chapter = 1; chapter <= 3; chapter++) {
      await page.locator('.home-chapter').nth(chapter - 1).evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY));
      await page.waitForTimeout(700);
      await expect(page.locator('.home-plan-entry')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${directory}/${width}-scene-${chapter}.png` });
      report.layouts.push({ width, chapter, mode: 'static', passed: true });
    }
    await page.getByRole('button', { name: '打开首页菜单', exact: true }).click();
    await page.waitForTimeout(850);
    await page.screenshot({ path: `${directory}/${width}-menu.png` });
    await page.getByRole('dialog', { name: '首页菜单' }).getByRole('button', { name: '开始规划', exact: true }).click();
    await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${directory}/${width}-workspace.png`, fullPage: true });
    expect(videos).toEqual([]);
    await page.close();
  }
  report.passed = report.errors.length === 0;
} finally {
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
}

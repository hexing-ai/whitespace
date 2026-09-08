import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { time: new Date().toISOString(), source: 'live-CDN', passed: false, requests: [], errors: [], bank: null };
page.on('request', request => { if (request.url().includes('.mp4')) report.requests.push({ url: request.url(), type: request.resourceType() }); });
page.on('pageerror', error => report.errors.push(error.message));
await mkdir('test-results/frame-live-cdn', { recursive: true });
try {
  await page.goto('http://127.0.0.1:3100');
  await page.waitForFunction(() => { const home = document.querySelector('.cinematic-home'); return ['ready', 'fallback'].includes(home?.dataset.bankState) || home?.dataset.videoState === 'unavailable'; }, null, { timeout: 65000 });
  await expect(page.locator('.cinematic-home')).toHaveAttribute('data-renderer', 'canvas');
  report.bank = await page.locator('.cinematic-home').evaluate(el => ({ ...el.dataset }));
  await page.locator('.cinematic-home').evaluate(el => window.scrollTo(0, (el.clientHeight - innerHeight) * .9));
  await expect.poll(() => page.locator('canvas').evaluate(el => Number(el.dataset.time))).toBeGreaterThan(8.9);
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/frame-live-cdn/desktop.png' });
  await page.getByRole('button', { name: '用示例体验' }).click();
  await expect(page.getByLabel('人数', { exact: true })).toHaveValue('5');
  report.passed = report.errors.length === 0;
} finally {
  if (!report.bank && await page.locator('.cinematic-home').count()) report.bank = await page.locator('.cinematic-home').evaluate(el => ({ ...el.dataset }));
  await writeFile('test-results/frame-live-cdn/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); await browser.close();
}

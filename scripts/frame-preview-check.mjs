import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { attachOriginalVideo } from './original-video-fixture.mjs';

const directory = 'test-results/frame-production';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = { time: new Date().toISOString(), passed: false, modes: [], layouts: [], errors: [] };
const percentile = values => [...values].sort((a, b) => a - b)[Math.floor(values.length * .95)] || 0;
try {
  for (const mode of ['canvas', 'video']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    report.input = await attachOriginalVideo(context);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.addInitScript(mode => {
      if (mode === 'video') Reflect.deleteProperty(window, 'VideoDecoder');
      const probe = window.frameProbe = { active: false, paints: [], intervals: [], longTasks: [], rafs: 0, bitmaps: 0, peakBitmaps: 0, workers: 0 };
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        live = true;
        constructor(...args) { super(...args); probe.workers++; }
        terminate() { if (this.live) { this.live = false; probe.workers--; } super.terminate(); }
      };
      const create = window.createImageBitmap;
      window.createImageBitmap = async (...args) => {
        const bitmap = await create(...args); probe.bitmaps++; probe.peakBitmaps = Math.max(probe.peakBitmaps, probe.bitmaps);
        const close = bitmap.close.bind(bitmap); let live = true;
        bitmap.close = () => { if (live) { live = false; probe.bitmaps--; } close(); };
        return bitmap;
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) { draw.apply(this, args); if (probe.active && args[0] instanceof ImageBitmap) probe.paints.push(performance.now()); };
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => raf(time => { probe.rafs++; callback(time); });
      document.addEventListener('loadeddata', event => {
        if (mode !== 'video' || !(event.target instanceof HTMLVideoElement)) return;
        const video = event.target;
        function presented() { if (probe.active) probe.paints.push(performance.now()); if (video.isConnected) video.requestVideoFrameCallback(presented); }
        video.requestVideoFrameCallback(presented);
      }, true);
      new PerformanceObserver(list => { if (probe.active) probe.longTasks.push(...list.getEntries().map(entry => entry.duration)); }).observe({ type: 'longtask', buffered: false });
    }, mode);
    await page.goto('http://127.0.0.1:3100');
    const home = page.locator('.cinematic-home');
    if (mode === 'canvas') await expect(home).toHaveAttribute('data-renderer', 'canvas', { timeout: 65000 });
    else await expect(home).toHaveAttribute('data-video-state', 'ready', { timeout: 20000 });
    const item = { mode, bank: await home.evaluate(el => ({ ...el.dataset })), paths: [], idleRafs: null, resourcesAfterExit: null };
    report.modes.push(item);
    for (const [name, from, to, duration] of [['slow', 0, 1, 5000], ['fast', 0, 1, 900], ['reverse', 1, 0, 3000]]) {
      await home.evaluate((el, p) => window.scrollTo(0, (el.clientHeight - innerHeight) * p), from);
      await page.waitForTimeout(1300);
      const metrics = await page.evaluate(async ({ from, to, duration }) => {
        const probe = window.frameProbe; probe.active = true; probe.paints = []; probe.intervals = []; probe.longTasks = [];
        const span = document.querySelector('.cinematic-home').clientHeight - innerHeight;
        const start = performance.now(); let previous = start;
        await new Promise(resolve => {
          function tick(now) {
            probe.intervals.push(now - previous); previous = now;
            const progress = Math.min(1, (now - start) / duration);
            scrollTo(0, span * (from + (to - from) * progress));
            if (progress < 1) requestAnimationFrame(tick); else resolve();
          }
          requestAnimationFrame(tick);
        });
        probe.active = false;
        return { paints: probe.paints, intervals: probe.intervals, longTasks: probe.longTasks, elapsedMs: performance.now() - start, peakBitmaps: probe.peakBitmaps };
      }, { from, to, duration });
      item.paths.push({ name, paintedFrames: metrics.paints.length, updatesPerSecond: metrics.paints.length / (metrics.elapsedMs / 1000), paintGapP95Ms: percentile(metrics.paints.slice(1).map((time, i) => time - metrics.paints[i])), browserFrameP95Ms: percentile(metrics.intervals), longTasks: metrics.longTasks, peakBitmaps: metrics.peakBitmaps });
    }
    await page.waitForTimeout(1600);
    const before = await page.evaluate(() => window.frameProbe.rafs);
    await page.waitForTimeout(700);
    item.idleRafs = await page.evaluate(value => window.frameProbe.rafs - value, before);
    expect(item.idleRafs).toBe(0);
    if (mode === 'canvas') {
      for (const width of [1440, 1280, 1100]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [chapter, p] of [[1, 0], [2, .45], [3, .9]]) {
          await home.evaluate((el, value) => window.scrollTo(0, value * (el.clientHeight - innerHeight)), p);
          await page.waitForTimeout(1300);
          await page.screenshot({ path: `${directory}/${width}-scene-${chapter}.png` });
          const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
          report.layouts.push({ width, chapter, mode, fits }); expect(fits).toBe(true);
        }
      }
    } else {
      await home.evaluate(el => window.scrollTo(0, .9 * (el.clientHeight - innerHeight)));
      await page.waitForTimeout(1300);
    }
    await page.getByRole('button', { name: '用示例体验' }).click();
    await expect(page.getByLabel('人数', { exact: true })).toHaveValue('5');
    await page.waitForTimeout(200);
    item.resourcesAfterExit = await page.evaluate(() => ({ bitmaps: window.frameProbe.bitmaps, workers: window.frameProbe.workers }));
    expect(item.resourcesAfterExit).toEqual({ bitmaps: 0, workers: 0 });
    await context.close();
  }
  for (const width of [768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage(); const media = [];
    page.on('request', request => { if (/\.mp4|frame-worker|mp4box/.test(request.url())) media.push(request.url()); });
    await page.goto('http://127.0.0.1:3100');
    await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode', 'static');
    for (const chapter of [1, 2, 3]) {
      await page.locator('.home-chapter').nth(chapter - 1).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${directory}/${width}-scene-${chapter}.png` });
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      report.layouts.push({ width, chapter, mode: 'static', fits }); expect(fits).toBe(true);
    }
    expect(media).toEqual([]);
    await page.getByRole('button', { name: '用示例体验' }).click();
    await expect(page.getByLabel('人数', { exact: true })).toHaveValue('5');
    await context.close();
  }
  expect(report.errors).toEqual([]);
  report.passed = true;
} finally {
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); await browser.close();
}

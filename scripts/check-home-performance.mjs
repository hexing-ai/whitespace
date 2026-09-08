import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv.find(s => s.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:3100';
const output = 'test-results/home-scenery'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const report = { time: new Date().toISOString(), target: base, passed: false, scenarios: [] };
const p95 = values => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * .95))] || 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const scenario of ['cold', 'warm', 'constrained']) {
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    if (scenario !== 'warm') await cdp.send('Network.clearBrowserCache');
    const constrained = scenario === 'constrained';
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: constrained ? 150 : 20, downloadThroughput: constrained ? 200000 : 1250000, uploadThroughput: 100000 });
    if (constrained) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      const original = requestAnimationFrame.bind(window);
      const probe = window.homeProbe = { rafs: 0, samples: [], longTasks: [], active: false, lcp: 0, cls: 0, paints: [] };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) { draw.apply(this, args); if (probe.active && args[0] instanceof ImageBitmap) { const t = performance.now(); queueMicrotask(() => probe.paints.push({ t, frame: this.canvas.dataset.frame, quality: this.canvas.dataset.quality })); } };
      window.requestAnimationFrame = cb => original(t => { probe.rafs++; cb(t); });
      new PerformanceObserver(list => { if (probe.active) probe.longTasks.push(...list.getEntries().map(e => e.duration)); }).observe({ type: 'longtask' });
      new PerformanceObserver(list => { probe.lcp = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) probe.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      // Probe RAF is deliberately separate from application RAF accounting.
      probe.start = () => { probe.samples = []; probe.longTasks = []; probe.paints = []; probe.active = true; const tick = t => { if (!probe.active) return; probe.samples.push(t); original(tick); }; original(tick); };
    });
    const errors = [], resources = []; let workers = 0;
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => resources.push(r.url())); page.on('worker', () => workers++);
    const started = Date.now(); await page.goto(base, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.cinematic-home')).toHaveAttribute('data-mode', 'natural');
    await expect(page.locator('.home-brand h1')).toBeVisible();
    const item = { scenario, navigationToReadableMs: Date.now() - started, paths: [], errors, workers }; report.scenarios.push(item);
    await expect(page.locator('.cinematic-home')).toHaveAttribute('data-landscape', 'ready', { timeout: 8000 });
    item.navigationToFrameMs = Date.now() - started;
    await expect(page.locator('.home-canvas')).toHaveAttribute('data-preview', 'ready', { timeout: 8000 });
    item.navigationToPreviewMs = Date.now() - started;
    await page.waitForTimeout(600);
    const before = await page.evaluate(() => window.homeProbe.rafs); await page.waitForTimeout(500);
    item.idleApplicationRafs = await page.evaluate(() => window.homeProbe.rafs) - before;
    item.lcpMs = await page.evaluate(() => window.homeProbe.lcp);
    for (const [name, delta, count, interval] of [['slow', 70, 28, 80], ['fast', 470, 6, 65], ['reverse', -190, 18, 65]]) {
      if (name !== 'reverse') await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200); await page.evaluate(() => window.homeProbe.start());
      for (let i = 0; i < count; i++) { await page.mouse.wheel(0, delta); await page.waitForTimeout(interval); }
      await page.waitForTimeout(200);
      const data = await page.evaluate(() => { const p = window.homeProbe; p.active = false; return { samples: p.samples, longTasks: p.longTasks, paints: p.paints, y: scrollY }; });
      const gaps = data.samples.slice(1).map((n, i) => n - data.samples[i]);
      const movement = data.paints.filter((paint,i) => !i || paint.frame !== data.paints[i-1].frame);
      item.paths.push({ name, paintedFrames: data.paints.length, changedPositions: movement.length, positionPaintGapP95Ms: p95(movement.slice(1).map((n,i) => n.t-movement[i].t)), sampledFrames: gaps.length, frameGapP95Ms: p95(gaps), frameGapMaxMs: Math.max(0, ...gaps), longTaskMaxMs: Math.max(0, ...data.longTasks), finalScrollY: data.y });
    }
    item.frameRequests = resources.filter(u => u.includes('/media/frames/')).length;
    item.videoRequests = resources.filter(u => u.includes('.mp4')).length;
    item.maxCachedBitmaps = Number(await page.locator('.home-canvas').getAttribute('data-bitmaps'));
    item.cls = await page.evaluate(() => window.homeProbe.cls);
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${output}/${scenario}.png`, fullPage: true });
    for (const [position, frame] of [[1, 240], [0, 0]]) {
      const before = Date.now(); await page.locator('.cinematic-home').evaluate((el,p) => scrollTo(0,p*(el.clientHeight-innerHeight)),position);
      await expect(page.locator('.home-canvas')).toHaveAttribute('data-frame', String(frame), { timeout: constrained ? 6000 : 2500 });
      item[frame === 240 ? 'endCatchupMs' : 'startCatchupMs'] = Date.now() - before;
      expect(await page.locator('.home-nav-links button').first().evaluate(el => getComputedStyle(el).color)).toBe(frame === 240 ? 'rgb(255, 255, 255)' : 'rgb(29, 48, 69)');
      if (scenario === 'cold') {
        await expect(page.locator('.home-canvas')).toHaveAttribute('data-quality', 'full');
        await page.screenshot({ path: `${output}/scenery-${frame === 240 ? 'end' : 'start'}.png` });
      }
    }
    await page.locator('.home-plan-entry').click(); await expect(page.getByLabel('成功标准', { exact: true })).toBeVisible();
    item.passed = errors.length === 0 && workers === 0 && item.videoRequests === 0 && item.frameRequests > 0 && item.maxCachedBitmaps <= 13 && item.navigationToFrameMs < (constrained ? 10000 : 4000) && item.idleApplicationRafs === 0 && item.cls < .1 && item.navigationToReadableMs < (constrained ? 10000 : 3000) && item.paths.every(p => p.sampledFrames > 10 && p.paintedFrames > 1 && p.frameGapP95Ms <= (constrained ? 100 : 50) && p.longTaskMaxMs <= 200);
    await page.close();
  }
  for (const width of [390, 768, 1280, 1440]) {
    const page = await context.newPage(); await page.setViewportSize({ width, height: 900 });
    await page.goto(base); await expect(page.locator('.home-brand h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true }); await page.close();
  }
  await context.close(); report.passed = report.scenarios.every(s => s.passed);
} finally { await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report)); if (!report.passed) process.exitCode = 1;

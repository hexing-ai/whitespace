import { test, expect, type Page } from "@playwright/test";
import { attachOriginalVideo } from "../../scripts/original-video-fixture.mjs";

test.beforeEach(async ({ context }) => { await attachOriginalVideo(context); });

test("decoded canvas restores the full timeline, bounds bitmaps and releases worker and GPU images", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    let workers = 0, bitmaps = 0, peak = 0;
    const update = () => { if (document.documentElement) Object.assign(document.documentElement.dataset, { liveWorkers: String(workers), liveBitmaps: String(bitmaps), peakBitmaps: String(peak) }); };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      live = true;
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); workers++; update(); }
      terminate() { if (this.live) { workers--; this.live = false; update(); } super.terminate(); }
    };
    const create = window.createImageBitmap;
    window.createImageBitmap = (async (...args: unknown[]) => {
      const bitmap = await Reflect.apply(create, window, args) as ImageBitmap;
      bitmaps++; peak = Math.max(peak, bitmaps); update();
      const close = bitmap.close.bind(bitmap); let live = true;
      bitmap.close = () => { if (live) { live = false; bitmaps--; update(); } close(); };
      return bitmap;
    }) as typeof createImageBitmap;
  });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const home = page.locator(".cinematic-home"), canvas = page.locator(".home-canvas");
  await expect(home).toHaveAttribute("data-renderer", "canvas", { timeout: 65000 });
  await expect(home).toHaveAttribute("data-bank-frames", "241");
  expect(await home.evaluate(el => el.clientHeight / innerHeight)).toBe(5);
  await expect(page.locator("html")).toHaveAttribute("data-live-workers", "0");
  for (const p of [.45, .9, .1, 1, 0]) {
    await progress(page, p);
    await expect.poll(() => canvas.evaluate((el, value) => Math.abs(Number(el.dataset.time) - value * 10.041667), p)).toBeLessThan(.05);
    expect(Number(await canvas.getAttribute("data-bitmaps"))).toBeLessThanOrEqual(24);
  }
  await progress(page, .9);
  await expect(page.getByRole("button", { name: "用示例体验" })).toBeVisible();
  await page.getByRole("button", { name: "用示例体验" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-live-bitmaps", "0");
  await expect(page.locator("html")).toHaveAttribute("data-live-workers", "0");
  expect(Number(await page.locator("html").getAttribute("data-peak-bitmaps"))).toBeLessThanOrEqual(24);
  await expect(page.getByLabel("人数", { exact: true })).toHaveValue("5");
  expect(errors).toEqual([]);
});

async function progress(page: Page, value: number) {
  await page.locator(".cinematic-home").evaluate((el, p) => window.scrollTo(0, p * (el.clientHeight - innerHeight)), value);
}

test("fallback video follows scroll, reverses, settles and releases on entry", async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, "VideoDecoder"); });
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const home = page.locator(".cinematic-home"), video = page.locator("video");
  await expect(home).toHaveAttribute("data-video-state", "ready", { timeout: 20000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("留白");
  await expect(page.locator(".home-plan-entry")).toBeVisible();
  expect(await video.evaluate(v => (v as HTMLVideoElement).paused)).toBe(true);
  await page.getByRole("button", { name: "向下了解" }).click();
  await expect(home).toHaveAttribute("data-chapter", "2");
  await expect(page.getByRole("heading", { name: /想做的很多，\s*这期先做好什么？/ })).toBeVisible();
  await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(3);
  await page.getByRole("button", { name: "前往开始行动" }).click();
  await expect(home).toHaveAttribute("data-chapter", "3");
  await expect(page.getByRole("button", { name: "用示例体验" })).toBeVisible();
  await expect.poll(() => video.evaluate(v => { const media = v as HTMLVideoElement; return Math.abs(media.currentTime - (media.duration - .05) * .9); })).toBeLessThan(.017);
  const settled = await video.evaluate(v => (v as HTMLVideoElement).currentTime);
  await page.waitForTimeout(400);
  expect(await video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeCloseTo(settled, 1);
  await progress(page, 0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeLessThan(.05);
  await progress(page, .9);
  await expect(page.getByRole("button", { name: "用示例体验" })).toBeVisible();
  const detachedVideo = await video.elementHandle();
  await page.getByRole("button", { name: "用示例体验" }).click();
  await expect(page.getByLabel("人数", { exact: true })).toHaveValue("5");
  await expect(home).toHaveCount(0);
  expect(await detachedVideo!.evaluate(v => v.hasAttribute("src"))).toBe(false);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(errors).toEqual([]);
});

for (const mode of ["reduced", "touch", "narrow"] as const) test(`${mode} uses a static readable page without video download`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: mode === "narrow" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mode === "touch", reducedMotion: mode === "reduced" ? "reduce" : "no-preference" });
  const page = await context.newPage(); const media: string[] = [];
  page.on("request", request => { if (/\.mp4|hero-ink/.test(request.url())) media.push(request.url()); });
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-mode", "static");
  await page.getByRole("button", { name: "向下了解" }).click();
  await page.getByRole("button", { name: "了解如何开始" }).click();
  await page.getByRole("button", { name: "用示例体验" }).click();
  await expect(page.getByLabel("人数", { exact: true })).toHaveValue("5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(media).toEqual([]);
  await context.close();
});

test("video failure keeps all content and the planning entry accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/*.mp4", route => route.abort());
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-video-state", "unavailable");
  await expect(page.locator(".home-chapter[inert]")).toHaveCount(0);
  await page.getByRole("button", { name: "开始规划", exact: true }).first().click();
  await expect(page.getByLabel("成功标准", { exact: true })).toHaveValue("");
});

test("changing reduced motion mid-story restores ordinary reading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-mode", "cinematic");
  await progress(page, .9);
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-chapter", "3");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-mode", "static");
  await expect(page.locator("video")).not.toHaveAttribute("src", /./);
  await expect(page.locator(".home-chapter[inert]")).toHaveCount(0);
  await page.getByRole("button", { name: "开始规划", exact: true }).first().click();
  await expect(page.locator("#stage-title")).toBeFocused();
});

test("skip preference avoids loading the home video and ink", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("whitespace:skip-intro:v1", "true"));
  const resources: string[] = [];
  page.on("request", request => { if (/\.mp4|whitespace-mountains|hero-ink|features_home/.test(request.url())) resources.push(request.url()); });
  await page.goto("/");
  await expect(page.getByLabel("成功标准", { exact: true })).toBeVisible();
  await expect(page.locator(".cinematic-home")).toHaveCount(0);
  expect(resources).toEqual([]);
});

test("a pending initial video request times out into ordinary reading", async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, "VideoDecoder"); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/*.mp4", () => {});
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-video-state", "loading");
  await page.clock.fastForward(15001);
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-video-state", "unavailable");
  await page.getByRole("button", { name: "开始规划", exact: true }).first().click();
  await expect(page.getByLabel("成功标准", { exact: true })).toBeVisible();
});

test("a seek that never completes releases the video and reveals the full introduction", async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, "VideoDecoder"); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-video-state", "ready", { timeout: 20000 });
  await page.clock.install();
  await page.locator("video").dispatchEvent("seeking");
  await page.clock.fastForward(8001);
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-video-state", "unavailable");
  await expect(page.locator("video")).not.toHaveAttribute("src", /./);
  await page.getByRole("button", { name: "用示例体验" }).click();
  await expect(page.getByLabel("人数", { exact: true })).toHaveValue("5");
});

test("frame download failure falls back to the playable video", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.route("**/*.mp4", route => route.request().resourceType() === "media" ? route.fallback() : route.abort());
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-bank-state", "fallback");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-mode", "cinematic");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-video-state", "ready", { timeout: 20000 });
  await progress(page, .45);
  await expect.poll(() => page.locator("video").evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(4);
  await page.getByRole("button", { name: "开始规划", exact: true }).first().click();
  await expect(page.getByLabel("成功标准", { exact: true })).toBeVisible();
});

test("sixty-second decode watchdog preserves video and terminates a stalled worker", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker { postMessage() {} };
  });
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-video-state", "ready", { timeout: 20000 });
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-bank-state", "building");
  await page.clock.fastForward(60001);
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-bank-state", "fallback");
  await expect(page.locator(".cinematic-home")).toHaveAttribute("data-mode", "cinematic");
});

test("hardware failure retries once with the real software decoder", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on("worker", worker => { void worker.evaluate(() => {
    const NativeDecoder = self.VideoDecoder;
    self.VideoDecoder = class extends NativeDecoder {
      configure(config: VideoDecoderConfig) {
        if (config.hardwareAcceleration === "prefer-hardware") throw new Error("Hardware unavailable");
        super.configure(config);
      }
    };
  }); });
  await page.goto("/");
  const home = page.locator(".cinematic-home");
  await expect(home).toHaveAttribute("data-renderer", "canvas", { timeout: 65000 });
  await expect(home).toHaveAttribute("data-acceleration", "prefer-software");
  await expect(home).toHaveAttribute("data-decoder-retry", "Hardware unavailable");
  await progress(page, .45);
  await expect.poll(() => page.locator("canvas").getAttribute("data-time")).not.toBe("0");
});

test("video timeout preserves the pending frame bank until its own deadline", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); document.documentElement.dataset.workerStopped = "false"; }
      postMessage() {}
      terminate() { document.documentElement.dataset.workerStopped = "true"; super.terminate(); }
    };
  });
  await page.route("**/*.mp4", () => {});
  await page.goto("/");
  const home = page.locator(".cinematic-home");
  await expect(home).toHaveAttribute("data-bank-state", "building");
  await page.clock.fastForward(15001);
  await expect(home).toHaveAttribute("data-bank-state", "building");
  await expect(home).toHaveAttribute("data-mode", "cinematic");
  await expect(page.locator("html")).not.toHaveAttribute("data-worker-stopped", "true");
  await page.clock.fastForward(45001);
  await expect(home).toHaveAttribute("data-mode", "static");
  await expect(page.locator("html")).toHaveAttribute("data-worker-stopped", "true");
});

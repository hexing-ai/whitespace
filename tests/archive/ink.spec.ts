import { test, expect, type Page } from "@playwright/test";

type Probe = { points: { x: number; y: number }[]; displayTimes: number[]; draws: number; live: number; capture: boolean; maxAlpha: number; pixels: number; context: WebGL2RenderingContext | null };
declare global { interface Window { inkProbe: Probe } }
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { points: [], displayTimes: [], draws: 0, live: 0, capture: false, maxAlpha: 0, pixels: 0, context: null };
    window.inkProbe = probe;
    const proto = WebGL2RenderingContext.prototype;
    const resources = new Set<unknown>();
    for (const name of ["Texture", "Framebuffer", "Program", "Shader", "Buffer"] as const) {
      const createName = `create${name}`, deleteName = `delete${name}`;
      const create = Reflect.get(proto, createName), remove = Reflect.get(proto, deleteName);
      Reflect.set(proto, createName, function (this: WebGL2RenderingContext, ...args: unknown[]) {
        const resource = create.apply(this, args); if (resource) resources.add(resource); probe.live = resources.size; return resource;
      });
      Reflect.set(proto, deleteName, function (this: WebGL2RenderingContext, value: unknown) {
        resources.delete(value); probe.live = resources.size; return remove.call(this, value);
      });
    }
    const locations = new WeakMap<WebGLUniformLocation, string>();
    const location = proto.getUniformLocation, vector = proto.uniform2f;
    proto.getUniformLocation = function (program, name) { const result = location.call(this, program, name); if (result) locations.set(result, name); return result; };
    proto.uniform2f = function (location, x, y) { if (location && locations.get(location) === "point") probe.points.push({ x, y }); vector.call(this, location, x, y); };
    const draw = proto.drawArrays;
    proto.drawArrays = function (...args) {
      draw.apply(this, args); probe.draws++; probe.context = this;
      if (this.getParameter(this.FRAMEBUFFER_BINDING) === null) probe.displayTimes.push(performance.now());
      if (probe.capture && this.getParameter(this.FRAMEBUFFER_BINDING) === null) {
        probe.capture = false;
        const bytes = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
        this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, bytes);
        probe.maxAlpha = 0; probe.pixels = 0;
        for (let i = 3; i < bytes.length; i += 4) { probe.maxAlpha = Math.max(probe.maxAlpha, bytes[i]); if (bytes[i] > 1) probe.pixels++; }
      }
    };
  });
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "rest");
  return (await page.locator(".hero-ink-background").boundingBox())!;
}
async function sweep(page: Page, fast = false) {
  const box = (await page.locator(".hero-ink-background").boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 120);
  for (let i = 0; i < 18; i++) {
    await page.mouse.move(box.x + 60 + i * (fast ? 32 : 6), box.y + 120 + Math.sin(i / 3) * 24);
    await page.waitForTimeout(35);
  }
}

test("real fluid: first entry is empty, gentle strokes, bounded fast strokes, fade and rest", async ({ page }) => {
  await instrument(page); const box = await ready(page);
  await page.mouse.move(box.x + 40, box.y + 80);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.inkProbe.draws)).toBe(0);
  await sweep(page);
  await page.evaluate(() => { window.inkProbe.capture = true; });
  await expect.poll(() => page.evaluate(() => window.inkProbe.capture)).toBe(false);
  const slow = await page.evaluate(() => ({ pixels: window.inkProbe.pixels, alpha: window.inkProbe.maxAlpha }));
  expect(slow.pixels).toBeGreaterThan(20); expect(slow.alpha).toBeGreaterThan(2); expect(slow.alpha).toBeLessThanOrEqual(67);
  await page.screenshot({ path: "test-results/ink-slow.png" });
  await page.mouse.move(0, 0); await sweep(page, true);
  await page.evaluate(() => { window.inkProbe.capture = true; });
  await expect.poll(() => page.evaluate(() => window.inkProbe.capture)).toBe(false);
  expect(await page.evaluate(() => window.inkProbe.maxAlpha)).toBeLessThanOrEqual(67);
  await page.screenshot({ path: "test-results/ink-fast.png" });
  await page.mouse.move(0, 0);
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "rest", { timeout: 12000 });
  const count = await page.evaluate(() => window.inkProbe.draws);
  await page.waitForTimeout(400); expect(await page.evaluate(() => window.inkProbe.draws)).toBe(count);
  await page.screenshot({ path: "test-results/ink-rest.png" });
});

test("text selection and buttons work, leaving home releases GPU resources and listeners", async ({ page }) => {
  await instrument(page); await ready(page); await sweep(page);
  const heading = page.locator("#welcome-title"), box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 10 }); await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain("留出空间");
  await page.getByRole("button", { name: "开始规划" }).click();
  await expect(page.locator(".hero-ink-background")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.inkProbe.live)).toBe(0);
  const draws = await page.evaluate(() => window.inkProbe.draws);
  await page.mouse.move(400, 400); await page.mouse.move(700, 600); await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.inkProbe.draws)).toBe(draws);
  await expect(page.getByLabel("成功标准", { exact: true })).toBeVisible();
});

test("intersection and document visibility stop rendering and resume without a long tail", async ({ page }) => {
  await instrument(page); await ready(page); await sweep(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "paused");
  const count = await page.evaluate(() => window.inkProbe.draws);
  await page.waitForTimeout(200); expect(await page.evaluate(() => window.inkProbe.draws)).toBe(count);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "rest");
  await page.evaluate(() => { document.body.style.paddingBottom = "2000px"; window.scrollTo(0, 1800); });
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "rest");
});

for (const mode of ["reduced", "touch", "no-webgl", "skip"] as const) test(`static fallback or unloaded workspace: ${mode}`, async ({ page }) => {
  await instrument(page);
  if (mode === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
  if (mode === "touch") await page.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { value: 1 }));
  if (mode === "skip") await page.addInitScript(() => localStorage.setItem("whitespace:skip-intro:v1", "true"));
  if (mode === "no-webgl") await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function (this: HTMLCanvasElement, type: string, options: unknown) { return type === "webgl2" ? null : original.call(this, type, options); } });
  });
  await page.goto("/");
  if (mode === "skip") {
    await expect(page.getByLabel("成功标准", { exact: true })).toBeVisible(); await expect(page.locator(".hero-ink-background")).toHaveCount(0);
  } else {
    await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "static");
    await page.getByRole("button", { name: "用示例体验" }).click();
    await expect(page.getByLabel("成功标准", { exact: true })).toHaveValue(/商家/);
  }
  expect(await page.evaluate(() => window.inkProbe.live)).toBe(0);
  expect(await page.evaluate(() => window.inkProbe.draws)).toBe(0);
});

test("runtime reduced-motion and context loss fall back without leaking resources", async ({ page }) => {
  await instrument(page); await ready(page); await sweep(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "static");
  await expect.poll(() => page.evaluate(() => window.inkProbe.live)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "rest");
  await sweep(page);
  await page.evaluate(() => window.inkProbe.context?.getExtension("WEBGL_lose_context")?.loseContext());
  await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "static");
  await expect.poll(() => page.evaluate(() => window.inkProbe.live)).toBe(0);
});

 test("resizing replaces framebuffers without growth and preserves container bounds", async ({ page }) => {
  await instrument(page); await ready(page);
  const resources = await page.evaluate(() => window.inkProbe.live);
  for (const width of [1440, 1100, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".hero-ink-background")).toHaveAttribute("data-ink-state", "rest");
    await sweep(page);
    expect(await page.evaluate(() => window.inkProbe.live)).toBe(resources);
    const canvas = (await page.locator(".hero-ink-background canvas").boundingBox())!;
    const hero = (await page.locator(".welcome").boundingBox())!;
    expect(canvas.x).toBe(hero.x); expect(canvas.width).toBe(hero.width);
    expect(canvas.height).toBeLessThanOrEqual(900);
  }
});

test("a fast pointer event paints along its path on the next rendered frame", async ({ page }) => {
  await instrument(page); const box = await ready(page);
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.45);
  await page.waitForTimeout(40);
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.45);
  await expect.poll(() => page.evaluate(() => window.inkProbe.points.length)).toBe(6);
  const points = await page.evaluate(() => window.inkProbe.points);
  expect(points[0].x).toBeGreaterThan(0.15); expect(points[0].x).toBeLessThan(0.4);
  expect(points.at(-1)!.x).toBeCloseTo(0.85, 2);
  await page.screenshot({ path: "test-results/ink-follow-sweep.png" });
});

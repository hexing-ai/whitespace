import { test, expect } from "@playwright/test";
import { validOutput } from "../fixtures";

for (const width of [1440, 768, 390, 320]) test(`persistent home entries and accessible full-screen menu at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  for (const chapter of await page.locator(".home-chapter").all()) {
    await chapter.scrollIntoViewIfNeeded();
    await expect(page.locator(".home-plan-entry")).toBeInViewport();
    await expect(page.locator(width >= 1024 ? ".home-nav-links" : ".home-nav-actions").getByRole("button", { name: "产品首页", exact: true })).toBeInViewport();
  }
  await page.getByRole("button", { name: "打开首页菜单", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "首页菜单", exact: true });
  await expect(menu).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  for (let n = 0; n < 10; n++) { await page.keyboard.press("Tab"); expect(await menu.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole("button", { name: "打开首页菜单", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByRole("button", { name: "打开首页菜单", exact: true }).click();
  await menu.getByRole("button", { name: "产品首页", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator(".home-plan-entry").click();
  await page.getByLabel("成功标准", { exact: true }).fill("完整保留这期的规划输入");
  for (const label of ["规划条件", "需求清单", "范围结果", "原文依据", "会议结论"]) {
    if (width <= 800 && !await page.locator(".directory").isVisible()) await page.getByRole("button", { name: "目录" }).click();
    await page.locator(".directory").getByRole("button", { name: label }).click();
    await expect(page.locator(".header-actions").getByRole("button", { name: "开始规划", exact: true })).toBeInViewport();
    await page.locator(".header-actions").getByRole("button", { name: "产品首页", exact: true }).click();
    await page.locator(".home-plan-entry").click();
    await expect(page.getByLabel("成功标准", { exact: true })).toHaveValue("完整保留这期的规划输入");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("home round trip preserves result, edited conclusion and explicit skip preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("whitespace:skip-intro:v1", "true"));
  await page.route("**/api/prioritize", route => route.fulfill({ json: validOutput() }));
  await page.goto("/");
  await page.getByRole("button", { name: "填入演示数据" }).click();
  await page.getByRole("button", { name: "下一步：需求清单" }).click();
  await page.getByRole("button", { name: "生成这期范围" }).click();
  await expect(page.locator(".feasible")).toBeVisible();
  await page.locator(".directory").getByRole("button", { name: "会议结论" }).click();
  await page.getByRole("textbox", { name: "会议结论", exact: true }).fill("本次已确认的会议结论");
  await page.getByRole("button", { name: "产品首页", exact: true }).click();
  await expect(page.locator(".cinematic-home")).toBeVisible();
  await page.locator(".home-plan-entry").click();
  await page.locator(".directory").getByRole("button", { name: "会议结论" }).click();
  await expect(page.getByRole("textbox", { name: "会议结论", exact: true })).toHaveValue("本次已确认的会议结论");
  await page.getByRole("button", { name: "开始规划", exact: true }).click();
  await expect(page.getByLabel("人数", { exact: true })).toHaveValue("5");
});

for (const exit of ["产品首页", "开始规划"]) test(`${exit} remains available during analysis and ignores the old response`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/prioritize", async route => { await pending; await route.fulfill({ json: validOutput() }).catch(() => {}); });
  await page.goto("/");
  await page.getByRole("button", { name: "用示例体验", exact: true }).click();
  await page.getByRole("button", { name: "下一步：需求清单" }).click();
  await page.getByRole("button", { name: "生成这期范围" }).click();
  await expect(page.locator(".waiting-state")).toBeVisible();
  await page.locator(".header-actions").getByRole("button", { name: exit, exact: true }).click();
  release();
  if (exit === "产品首页") await page.locator(".home-plan-entry").click();
  await expect(page.getByLabel("人数", { exact: true })).toHaveValue("5");
  await page.locator(".directory").getByRole("button", { name: "范围结果" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("已停止等待本次分析");
  await expect(page.locator(".feasible")).toHaveCount(0);
});

test('public demo notice preserves the desktop directory and full-width working area', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');await page.locator('.home-plan-entry').click();
  await expect(page.getByText(/公共演示使用共享额度/)).toBeVisible();
  const directory=await page.locator('.directory').boundingBox(),stage=await page.locator('.stage').boundingBox();
  expect(directory).not.toBeNull();expect(stage).not.toBeNull();
  expect(stage!.x).toBeGreaterThan(directory!.x+directory!.width);
  expect(stage!.width).toBeGreaterThan(700);
  expect(Math.abs(stage!.y-directory!.y)).toBeLessThan(40);
});

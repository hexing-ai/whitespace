import { test, expect, type Page } from "@playwright/test";
import { validOutput, modelResult } from "../fixtures";
import { parseResult } from "../../src/lib/schema";
import { demoInput } from "../../src/lib/demo";
import exclusionCases from "../exclusions/cases.v1.json";

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

async function go(page: Page, label: string) {
  if (await page.locator(".mobile-nav").isVisible() && !await page.locator(".directory").isVisible()) await page.getByRole("button", { name: "目录" }).click();
  await page.locator(".directory").getByRole("button", { name: label }).click();
}
async function example(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "用示例体验" }).click();
}
async function requirements(page: Page) { await page.getByRole("button", { name: "下一步：需求清单" }).click(); }
async function expand(page: Page, index: number) {
  const toggle = page.locator(".requirement-toggle").nth(index - 1);
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
}
async function generate(page: Page) { await page.getByRole("button", { name: "生成这期范围" }).click(); }

test("demo edits, row controls and real missing-key recovery", async ({ page }) => {
  await example(page);
  await expect(page.getByLabel("人数", { exact: true })).toHaveValue("5");
  await page.locator(".demo-options summary").click(); await page.getByRole("button", { name: "把工期改成 3 天" }).click();
  await expect(page.getByLabel("这期工作日")).toHaveValue("3");
  await requirements(page); await expand(page, 12);
  await expect(page.getByLabel("需求 12 名称", { exact: true })).toHaveValue("报名审批钉钉通知");
  await page.getByRole("button", { name: "添加需求" }).click();
  await expect(page.getByLabel("需求 13 名称", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "删除需求 13", exact: true }).click();
  await generate(page);
  await page.getByRole("dialog").getByLabel("邀请码", { exact: true }).fill("browser-test-invite-only");
  await page.getByRole("button", { name: "验证并继续生成" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("未配置 DASHSCOPE_API_KEY，请在 .env.local 填写阿里云百炼 Key。");
  await page.getByRole("button", { name: "返回修改需求" }).click(); await expand(page, 1);
  await expect(page.getByLabel("需求 1 名称", { exact: true })).toHaveValue("商家报名表");
});

test("loading locks navigation, one request, edited note persists and input invalidates every result", async ({ page, context }) => {
  let release: () => void = () => {}; let calls = 0;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/prioritize", async route => { calls++; await waiting; await route.fulfill({ json: validOutput() }); });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await example(page); await requirements(page);
  await page.locator("form").evaluate(form => { for (let i = 0; i < 4; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await expect.poll(() => calls).toBe(1);
  await expect(page.locator(".stage")).toHaveAttribute("data-view", "scope");
  for (const button of await page.locator(".directory button").all()) await expect(button).toBeDisabled();
  await expect(page.locator(".waiting-state")).toContainText("正在对照成功标准划定范围");
  release();
  await expect(page.getByRole("region", { name: "这期必须做", exact: true }).locator("article")).toHaveCount(3);
  await go(page, "会议结论");
  await page.getByRole("textbox", { name: "会议结论", exact: true }).fill("会中确认：报名、审核、上线。\n这期不做排行榜。");
  await go(page, "原文依据"); await go(page, "会议结论");
  await expect(page.getByRole("textbox", { name: "会议结论", exact: true })).toHaveValue(/会中确认/);
  await page.getByRole("button", { name: "复制结论" }).click();
  await expect(page.getByText("已复制会议结论")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("会中确认");
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: () => Promise.reject(new Error("denied")) }); });
  await page.getByRole("button", { name: "复制结论" }).click();
  await expect(page.getByText("复制失败，请选中下方会议结论并手动复制。")).toBeVisible();
  await go(page, "规划条件"); await page.locator(".demo-options summary").click(); await page.getByRole("button", { name: "把工期改成 3 天" }).click();
  for (const label of ["范围结果", "原文依据", "会议结论"]) {
    await go(page, label); await expect(page.getByText("当前内容待生成")).toBeVisible();
    await expect(page.locator(".group,.coverage-panel,.meeting")).toHaveCount(0);
  }
  expect(calls).toBe(1);
});

test("explicit exclusion persists, submits, causes conflict and clears on edit", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const c = exclusionCases.cases.find(c => c.id === "exclude_independent")!;
  await page.route("**/api/prioritize", async route => {
    const input = route.request().postDataJSON(); expect(input.requirements[1].excluded).toBe(true);
    await route.fulfill({ json: parseResult(JSON.stringify(c.analysis), input) });
  });
  await example(page); await page.getByLabel("成功标准", { exact: true }).fill(c.input.success);
  await requirements(page);
  for (let n = 12; n > c.input.requirements.length; n--) { await expand(page, n); await page.getByRole("button", { name: `删除需求 ${n}`, exact: true }).click(); }
  for (const [i, row] of c.input.requirements.entries()) {
    await expand(page, i + 1);
    await page.getByLabel(`需求 ${i + 1} 名称`, { exact: true }).fill(row.name);
    await page.getByLabel(`需求 ${i + 1} 说明`, { exact: true }).fill(row.desc);
    await page.getByLabel(`需求 ${i + 1} 预估人天`, { exact: true }).fill("1");
  }
  await page.getByLabel("需求 2 本期明确不做", { exact: true }).check();
  await go(page, "规划条件"); await page.locator(".demo-options summary").click(); await page.getByRole("button", { name: "把工期改成 3 天" }).click();
  await requirements(page); await expect(page.getByLabel("需求 2 本期明确不做", { exact: true })).toBeChecked();
  await generate(page);
  await expect(page.getByRole("region", { name: "目标冲突", exact: true })).toContainText("内容校验");
  await expect(page.getByRole("region", { name: "这期必须做", exact: true }).locator("article")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "部分工作候选" })).toContainText("导出成员名单");
  await page.getByRole("region", { name: "这期明确不做", exact: true }).locator("summary").click();
  await expect(page.getByText("用户明确排除", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "这期明确不做", exact: true })).toContainText("你已标记");
  await go(page, "会议结论"); await page.getByRole("button", { name: "复制结论" }).click();
  await expect(page.getByText("已复制会议结论")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("目标冲突");
  await go(page, "需求清单"); await page.getByLabel("需求 2 本期明确不做", { exact: true }).uncheck();
  await go(page, "范围结果"); await expect(page.getByText("当前内容待生成")).toBeVisible();
});

test("unreachable and uncertain results expose reasons and evidence in separate views", async ({ page }) => {
  const output = parseResult(JSON.stringify(modelResult()), { ...demoInput, people: 1, workdays: 3 });
  await page.route("**/api/prioritize", route => route.fulfill({ json: output }));
  await example(page); await requirements(page); await generate(page);
  await expect(page.getByRole("region", { name: "部分工作候选" })).toContainText("运营审核");
  await expect(page.getByRole("region", { name: "这期必须做", exact: true }).locator("article")).toHaveCount(0);
  await go(page, "原文依据");
  const coverage = page.getByRole("region", { name: "成功标准对应" });
  await coverage.locator("summary").first().click();
  await expect(coverage.locator("blockquote").first()).toContainText("商家填写活动报名信息并提交");
  await go(page, "会议结论"); await expect(page.getByRole("textbox", { name: "会议结论", exact: true })).toHaveValue(/本期承诺：无/);
  const input = structuredClone(demoInput); input.requirements[0].desc += "；依赖尚未确认的外部授权";
  const analysis = modelResult(); analysis.items[0].dependencies = [{ toId: null, kind: "uncertain", quote: "依赖尚未确认的外部授权" }];
  await page.unroute("**/api/prioritize");
  await page.route("**/api/prioritize", route => route.fulfill({ json: parseResult(JSON.stringify(analysis), input) }));
  await go(page, "需求清单"); await generate(page);
  await expect(page.getByText("前置条件待确认，当前不形成承诺")).toBeVisible();
});

test("invalid response, timeout, offline and retry preserve submitted data", async ({ page, context }) => {
  await example(page); await requirements(page);
  await page.route("**/api/prioritize", route => route.fulfill({ json: { ...validOutput(), feasibility: "queued" }, headers: { "X-Request-Id": "invalid-transport" } }));
  await generate(page);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("服务返回的范围格式异常，请重新生成。");
  await expect(page.getByText("排查编号：invalid-transport")).toBeVisible();
  await page.unroute("**/api/prioritize");
  await page.route("**/api/prioritize", route => route.fulfill({ status: 504, json: { error: { code: "TIMEOUT", message: "生成超时，请稍后重新生成。" } } }));
  await page.getByRole("button", { name: "重新生成范围" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("生成超时，请稍后重新生成。");
  await page.unroute("**/api/prioritize"); await context.setOffline(true);
  await page.getByRole("button", { name: "重新生成范围" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("网络连接中断，请检查网络后重试。");
  await context.setOffline(false); await go(page, "需求清单"); await expand(page, 1);
  await expect(page.getByLabel("需求 1 名称", { exact: true })).toHaveValue("商家报名表");
  await page.route("**/api/prioritize", route => route.fulfill({ json: validOutput() }));
  await generate(page); await expect(page.locator(".feasible")).toBeVisible();
});

for (const width of [1440, 1280, 1100, 768, 390, 320]) test(`single active view and vertical layout at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const output = parseResult(JSON.stringify(modelResult()), { ...demoInput, people: 1, workdays: 3 });
  output.goalCoverage[0].text = "这是检查长目标完整换行的成功标准".repeat(8);
  output.goalCoverage[0].evidence[0].quote = "long_evidence_".repeat(30);
  await page.route("**/api/prioritize", route => route.fulfill({ json: output }));
  await page.goto("/"); await expect(page.locator(".cinematic-home")).toBeVisible();
  await page.screenshot({ path: `test-results/welcome-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "用示例体验" }).click();
  await expect(page.locator(".stage")).toHaveCount(1);
  const success = await page.getByLabel("成功标准", { exact: true }).boundingBox();
  const people = await page.getByLabel("人数", { exact: true }).boundingBox();
  const days = await page.getByLabel("这期工作日").boundingBox();
  expect(people!.y).toBeGreaterThan(success!.y + success!.height);
  expect(days!.y).toBeGreaterThan(people!.y + people!.height);
  await page.screenshot({ path: `test-results/conditions-${width}.png`, fullPage: true });
  await requirements(page);
  await expect(page.locator(".stage")).toHaveCount(1);
  await expect(page.getByLabel("成功标准", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `test-results/requirements-${width}.png`, fullPage: true });
  await generate(page); await expect(page.locator(".remaining")).toContainText("部分候选人天");
  const groups = await page.locator(".group").all();
  for (let i = 1; i < groups.length; i++) {
    const previous = await groups[i - 1].boundingBox(), current = await groups[i].boundingBox();
    expect(current!.y).toBeGreaterThanOrEqual(previous!.y + previous!.height);
  }
  for (const [label, view] of [["范围结果", "scope"], ["原文依据", "evidence"], ["会议结论", "note"]]) {
    await go(page, label);
    await expect(page.locator(".stage")).toHaveCount(1);
    await expect(page.locator(".stage")).toHaveAttribute("data-view", view);
    await expect(page.locator("#stage-title")).toBeFocused();
    if (view === "evidence") await page.locator(".coverage-panel summary").first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${view}-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("invalid conditions and collapsed row errors focus the field without a request", async ({ page }) => {
  let calls = 0; await page.route("**/api/prioritize", route => { calls++; return route.fulfill({ json: validOutput() }); });
  await page.goto("/"); await page.getByRole("button", { name: "开始规划", exact: true }).first().click();
  await requirements(page);
  await expect(page.getByLabel("成功标准", { exact: true })).toBeFocused();
  await expect(page.locator("#error-success")).toHaveText("请填写具体成功标准，不能只有空格。");
  await page.getByLabel("成功标准", { exact: true }).fill("用户提交报名");
  await requirements(page);
  await page.getByLabel("需求 1 名称", { exact: true }).fill("报名");
  await generate(page);
  await expect(page.getByLabel("需求 2 名称", { exact: true })).toBeFocused();
  await expect(page.locator("#error-name-r2")).toBeVisible();
  expect(calls).toBe(0);
  await go(page, "规划条件"); await page.getByRole("button", { name: "填入演示数据" }).click();
  await requirements(page); await generate(page);
  await expect(page.locator(".feasible")).toBeVisible();
});

test("only intro preference persists; help supports keyboard return and preference cancellation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "使用说明", exact: true }).click();
  await page.getByRole("dialog").getByLabel("下次直接进入工作台").check();
  await page.getByRole("button", { name: "返回引导" }).click();
  await page.getByRole("button", { name: "用示例体验" }).click();
  await page.reload();
  await expect(page.getByLabel("成功标准", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["whitespace:skip-intro:v1"]);
  await page.getByRole("button", { name: "使用说明" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "使用说明" })).toBeFocused();
  await page.getByRole("button", { name: "使用说明" }).click();
  await page.getByRole("dialog").getByLabel("下次直接进入工作台").uncheck();
  await page.getByRole("button", { name: "返回规划" }).click();
  await page.reload(); await expect(page.locator(".cinematic-home")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("unavailable preference storage does not block planning", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("denied"); };
    Storage.prototype.setItem = () => { throw new Error("denied"); };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "使用说明", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("无法读取引导偏好");
  await page.getByRole("button", { name: "返回引导" }).click();
  await page.getByRole("button", { name: "使用说明", exact: true }).click();
  await page.getByRole("dialog").getByLabel("下次直接进入工作台").check();
  await page.getByRole("button", { name: "返回引导" }).click();
  await page.getByRole("button", { name: "使用说明", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("浏览器未能保存引导偏好");
  await page.getByRole("button", { name: "返回引导" }).click();
  await page.getByRole("button", { name: "开始规划", exact: true }).first().click();
  await expect(page.getByLabel("成功标准", { exact: true })).toBeVisible();
});

test('invitation cancellation, errors, cookie expiry and input recovery use the real access gate', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await example(page); await requirements(page); await generate(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('邀请码', { exact: true })).toBeFocused();
  await page.screenshot({path:'test-results/invite-mobile.png',fullPage:true});
  await dialog.getByLabel('邀请码', { exact: true }).fill('incorrect-code');
  await dialog.getByRole('button', { name: '验证并继续生成' }).click();
  await expect(dialog.getByRole('alert')).toContainText('邀请码不正确');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '返回修改需求' }).click(); await expand(page, 1);
  await expect(page.getByLabel('需求 1 名称', { exact: true })).toHaveValue('商家报名表');
  await generate(page); await dialog.getByLabel('邀请码', { exact: true }).fill('browser-test-invite-only');
  await dialog.getByRole('button', { name: '验证并继续生成' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('未配置 DASHSCOPE_API_KEY');
  const cookie = (await context.cookies()).find(c => c.name === 'whitespace_invite');
  expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
  expect(await page.evaluate(() => document.cookie)).not.toContain('whitespace_invite');
  await context.clearCookies();
  await page.getByRole('button', { name: '返回修改需求' }).click(); await generate(page);
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

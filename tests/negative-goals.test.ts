import { afterEach, expect, it, vi } from "vitest";
import { splitGoals, parseResult, validateInput } from "../src/lib/schema";
import { POST } from "../src/app/api/prioritize/route";
import type { PrioritizeInput } from "../src/lib/contracts";

const base: PrioritizeInput = { people: 5, workdays: 10, success: "用户能提交资料；本期不发优惠券", requirements: [
  { id: "r1", name: "资料提交", desc: "用户提交资料", estimateDays: 1 },
  { id: "r2", name: "发放优惠券", desc: "向用户发放优惠券", estimateDays: 2 },
] };
const analysis = () => ({ items: [
  { id: "r1", scope: "core", estimateDays: 1, links: [{ goalId: "g1", kind: "required", source: "desc", actionIndex: 0 }], dependencies: [] },
  { id: "r2", scope: "incentive", estimateDays: 2, links: [], dependencies: [] },
], goalGaps: [] });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each(["；", ";", "\n", "。", "，", ",", "、"])("does not create a missing capability for a standalone exclusion separated by %j", separator => {
  const input = { ...base, success: `用户能提交资料${separator}本期不发优惠券` };
  const before = structuredClone(input);
  const output = parseResult(JSON.stringify(analysis()), input, true);
  expect(output.feasibility).toBe("feasible");
  expect(output.goalCoverage.map(g => g.text)).toEqual(["用户能提交资料"]);
  expect(output.must.map(r => r.id)).toEqual(["r1"]);
  expect(output.wont.map(r => r.id)).toEqual(["r2"]);
  expect(output.warnings).toEqual([]);
  expect(output.meetingNote).toContain("本期不发优惠券");
  expect(input).toEqual(before);
  expect(input.requirements.every(r => r.excluded === undefined)).toBe(true);
});
it("assigns goal IDs after removing standalone scope limitations", () => {
  expect(splitGoals("本期不发优惠券；用户能提交资料；暂不接入短信服务；运营能审核资料")).toEqual([
    { id: "g1", text: "用户能提交资料" }, { id: "g2", text: "运营能审核资料" },
  ]);
});
it.each([
  "不得泄露个人资料", "禁止未授权访问", "用户无需登录即可提交资料", "提交后不能丢失资料",
  "本期不允许未授权用户下载资料", "本期不支持非法访问", "本期不发优惠券但用户能提交资料",
  "本期不发优惠券并支持导出资料", "用户不仅能提交资料还能修改资料", "本期不是不做资料提交",
])("preserves a constraint, mixed delivery, or double negative: %s", success => {
  expect(splitGoals(success)).toEqual([{ id: "g1", text: success }]);
});
it("still reports an actual missing positive capability", () => {
  const output = parseResult(JSON.stringify(analysis()), { ...base, success: `${base.success}；运营能审核资料` }, true);
  expect(output.feasibility).toBe("infeasible");
  expect(output.goalCoverage.find(g => g.text === "运营能审核资料")?.status).toBe("missing");
  expect(output.must).toEqual([]);
});
it("still enforces explicitly excluded necessary work", () => {
  const input = { ...base, requirements: base.requirements.map(r => ({ ...r, excluded: r.id === "r1" })) };
  const output = parseResult(JSON.stringify(analysis()), input, true);
  expect(output.feasibility).toBe("infeasible");
  expect(output.goalConflicts[0].excludedIds).toEqual(["r1"]);
  expect(output.must).toEqual([]);
});
it("still enforces capacity and unknown dependencies", () => {
  expect(parseResult(JSON.stringify(analysis()), { ...base, people: 1, workdays: 1 }, true).feasibility).toBe("infeasible");
  const input = structuredClone(base);
  input.requirements[0].desc += "；依赖尚未确认的外部授权";
  const a = analysis();
  Object.assign(a.items[0], { dependencies: [{ toId: null, kind: "uncertain", clauseIndex: 1 }] });
  const output = parseResult(JSON.stringify(a), input, true);
  expect(output.feasibility).toBe("needs_confirmation");
  expect(output.must).toEqual([]);
});
it("rejects exclusion-only input before a paid call", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const input = { ...base, success: "本期不发优惠券；暂不接入短信服务" };
  expect(() => validateInput(input)).toThrow(/成功标准/);
  const response = await POST(new Request("http://localhost/api/prioritize", { method: "POST", body: JSON.stringify(input) }));
  expect(response.status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("preserves scope limitations as model context without converting them to goals or exclusion flags", async () => {
  vi.stubEnv("DASHSCOPE_API_KEY", "test-only-key");
  vi.stubEnv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1");
  vi.stubEnv("DASHSCOPE_MODEL", "qwen3.6-plus");
  vi.spyOn(console, "info").mockImplementation(() => {});
  const fetcher = vi.fn().mockResolvedValue(Response.json({ model: "qwen3.6-plus", choices: [{ message: { content: JSON.stringify(analysis()) }, finish_reason: "stop" }] }));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(new Request("http://localhost/api/prioritize", { method: "POST", body: JSON.stringify(base) }));
  expect(response.status).toBe(200);
  expect((await response.json()).feasibility).toBe("feasible");
  const payload = JSON.parse(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content);
  expect(payload.goals).toEqual([{ id: "g1", text: "用户能提交资料", actions: ["用户能提交资料"] }]);
  expect(payload.scopeConstraints).toEqual(["本期不发优惠券"]);
  expect(payload.requirements.every((row: object) => !("excluded" in row))).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

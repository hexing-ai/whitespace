import { afterEach, describe, expect, it, vi } from "vitest";
import { decodePlan, PlannerApiError, requestPlan } from "../src/features/planner/api";
import { demoInput } from "../src/lib/demo";
import { validOutput } from "./fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("frontend transport boundary", () => {
  it.each(["feasible", "infeasible", "needs_confirmation"])("accepts completed business state %s", feasibility => {
    expect(decodePlan({ ...validOutput(), feasibility }).feasibility).toBe(feasibility);
  });
  it.each([
    null, {}, { ...validOutput(), feasibility: "queued" },
    { ...validOutput(), candidateDays: Infinity },
    { ...validOutput(), needsConfirmation: undefined },
    { ...validOutput(), goalCoverage: [{ id: "g1", text: "目标", requiredIds: [], missingIds: [], evidence: [], status: "success" }] },
    { ...validOutput(), dependencies: [{ fromId: "r1", toId: "r2", kind: "related", quote: "关联" }] },
    { ...validOutput(), goalConflicts: [{ goalId: "g1", excludedIds: null, message: "冲突" }] },
    { ...validOutput(), must: [{ id: "r1", name: "需求", moscow: "must", reason: "理由", estimateDays: "1" }] },
  ])("rejects malformed and unknown contract values", data => {
    expect(() => decodePlan(data)).toThrow(PlannerApiError);
  });
  it("retains request ID for malformed 200 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ feasibility: "done" }, { headers: { "X-Request-Id": "case-invalid" } })));
    await expect(requestPlan(demoInput, new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE", requestId: "case-invalid" });
  });
  it("preserves safe server errors and never retries automatically", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "RATE_LIMITED", message: "请稍后重新生成。" } }, { status: 503, headers: { "X-Request-Id": "case-limited" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestPlan(demoInput, new AbortController().signal)).rejects.toMatchObject({ code: "RATE_LIMITED", requestId: "case-limited" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const options = fetcher.mock.calls[0][1];
    expect(options.cache).toBe("no-store");
    expect(JSON.parse(options.body)).toEqual(demoInput);
  });
  it("does not expose a non-JSON server response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>internal trace</html>", { status: 502 })));
    await expect(requestPlan(demoInput, new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE", message: "服务返回了无效内容，请稍后重试。" });
  });
  it("ends the browser wait at 70 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const pending = expect(requestPlan(demoInput, new AbortController().signal)).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(70_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("distinguishes leaving the page from a network failure", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new TypeError("abort"))))));
    const pending = expect(requestPlan(demoInput, controller.signal)).rejects.toMatchObject({ code: "CANCELLED" });
    controller.abort();
    await pending;
  });
});
it('shows a useful message for a firewall HTML rate-limit response without retrying', async () => {
  const fetcher=vi.fn().mockResolvedValue(new Response('<html>firewall</html>',{status:429}));vi.stubGlobal('fetch',fetcher);
  await expect(requestPlan(demoInput,new AbortController().signal)).rejects.toMatchObject({code:'RATE_LIMITED',message:'公共演示请求过于频繁或暂时繁忙，请稍后重试。'});
  expect(fetcher).toHaveBeenCalledTimes(1);
});

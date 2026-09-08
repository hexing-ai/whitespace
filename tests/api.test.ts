import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/prioritize/route";
import { configuration, prioritize } from "../src/lib/qwen";
import { demoInput } from "../src/lib/demo";
import { completion, modelResult } from "./fixtures";
const response = (body = completion()) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
function request(body: unknown = demoInput) { return new Request("http://localhost/api/prioritize", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => { vi.stubEnv("DASHSCOPE_API_KEY", "test-only-key"); vi.stubEnv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"); vi.stubEnv("DASHSCOPE_MODEL", "qwen-plus"); vi.stubEnv("DASHSCOPE_TIMEOUT_MS", "30000"); vi.stubEnv("DASHSCOPE_TEMPERATURE", "0.2"); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("provider configuration", () => {
  it("uses the evaluated default model", () => expect(configuration({ DASHSCOPE_API_KEY: "test" }).model).toBe("qwen3.6-plus"));
  it("fails closed without a key", async () => { vi.stubEnv("DASHSCOPE_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const out = await POST(request()); expect(out.status).toBe(503); expect((await out.json()).error.message).toBe("未配置 DASHSCOPE_API_KEY，请在 .env.local 填写阿里云百炼 Key。"); expect(fetcher).not.toHaveBeenCalled(); });
  it.each(["https://api.openai.com/v1", "https://dashscope.aliyuncs.com.evil.test/compatible-mode/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1?x=1", "https://user:pass@dashscope.aliyuncs.com/compatible-mode/v1"])("blocks unapproved endpoint %s", (baseURL) => expect(() => configuration({ DASHSCOPE_API_KEY: "test", DASHSCOPE_BASE_URL: baseURL })).toThrow());
  it.each(["deepseek-chat", "gpt-4", "gemini", "claude"])("blocks unapproved model %s", (model) => expect(() => configuration({ DASHSCOPE_API_KEY: "test", DASHSCOPE_MODEL: model })).toThrow());
  it("accepts international endpoint", () => expect(configuration({ DASHSCOPE_API_KEY: "test", DASHSCOPE_BASE_URL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" }).baseURL).toContain("dashscope-intl"));
  it("rejects invalid timeout and temperature", () => { expect(() => configuration({ DASHSCOPE_API_KEY: "test", DASHSCOPE_TIMEOUT_MS: "65000" })).toThrow(); expect(() => configuration({ DASHSCOPE_API_KEY: "test", DASHSCOPE_TEMPERATURE: "NaN" })).toThrow(); });
});
describe("API and SDK", () => {
  it("uses only the configured provider and never exposes secrets", async () => { const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetcher); const out = await POST(request()); expect(out.status).toBe(200); const body = await out.text(); expect(body).not.toContain("test-only-key"); expect(body).toContain('"mustDays":6'); const [url, init] = fetcher.mock.calls[0]; expect(String(url)).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"); expect(init.redirect).toBe("error"); expect(JSON.parse(init.body).model).toBe("qwen-plus"); expect(JSON.parse(init.body).enable_thinking).toBe(false); expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("商家报名"); expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("test-only-key"); });
  it("rejects invalid input before any paid call", async () => { const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect((await POST(request({ ...demoInput, success: "" }))).status).toBe(400); expect(fetcher).not.toHaveBeenCalled(); });
  it("rejects malformed and oversized request bodies", async () => { expect((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400); expect((await POST(request("x".repeat(65536)))).status).toBe(413); });
  it("retries malformed output once then returns sanitized failure", async () => { const fetcher = vi.fn().mockImplementation(() => response(completion("secret sensitive raw"))); vi.stubGlobal("fetch", fetcher); const out = await POST(request()); expect(out.status).toBe(502); expect(fetcher).toHaveBeenCalledTimes(2); expect(await out.text()).not.toContain("sensitive"); });
  it("repairs business violations once with the previous candidate", async () => { const bad = modelResult(); bad.items[0].estimateDays = 500; const fetcher = vi.fn().mockResolvedValueOnce(response(completion(JSON.stringify(bad)))).mockResolvedValueOnce(response()); vi.stubGlobal("fetch", fetcher); expect((await prioritize(demoInput)).mustDays).toBe(6); expect(fetcher).toHaveBeenCalledTimes(2); const messages = JSON.parse(fetcher.mock.calls[1][1].body).messages; expect(messages[2]).toEqual({ role: "assistant", content: completion(JSON.stringify(bad)).choices[0].message.content }); expect(messages[3].content).toContain("上次结果"); });
  it("calculates no commitment when necessary work exceeds capacity", async () => { const fetcher = vi.fn().mockImplementation(() => response()); vi.stubGlobal("fetch", fetcher); const out = await POST(request({ ...demoInput, people: 1, workdays: 3 })); expect(out.status).toBe(200); const body = await out.json(); expect(body.must).toEqual([]); expect(body.mustDays).toBe(0); expect(body.feasibility).toBe("infeasible"); expect(body.candidateDays).toBeLessThanOrEqual(2.1); expect(fetcher).toHaveBeenCalledTimes(1); });
  it.each([401, 403, 400])("does not retry nonrecoverable provider status %s", async (status) => { const fetcher = vi.fn().mockImplementation(() => new Response(JSON.stringify({ error: { message: "secret" } }), { status })); vi.stubGlobal("fetch", fetcher); const out = await POST(request()); expect(out.status).toBe(502); expect(fetcher).toHaveBeenCalledTimes(1); expect(await out.text()).not.toContain("secret"); });
  it.each([429, 500])("retries recoverable provider status %s only once", async (status) => { const fetcher = vi.fn().mockImplementation(() => new Response("{}", { status })); vi.stubGlobal("fetch", fetcher); expect((await POST(request())).status).toBe(status === 429 ? 503 : 502); expect(fetcher).toHaveBeenCalledTimes(2); });
  it("bounds network retries", async () => { const fetcher = vi.fn().mockRejectedValue(new TypeError("private upstream details")); vi.stubGlobal("fetch", fetcher); const out = await POST(request()); expect(out.status).toBe(502); expect(fetcher).toHaveBeenCalledTimes(2); expect((await out.json()).error.code).toBe("NETWORK_ERROR"); });
  it("handles real SDK timeout behavior with a simulated stalled transport", async () => { vi.stubEnv("DASHSCOPE_TIMEOUT_MS", "10"); const fetcher = vi.fn((_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError"))); })); vi.stubGlobal("fetch", fetcher); const out = await POST(request()); expect(out.status).toBe(504); expect(fetcher).toHaveBeenCalledTimes(2); });
  it("stops on client cancellation", async () => { const controller = new AbortController(); controller.abort(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await expect(prioritize(demoInput, controller.signal)).rejects.toMatchObject({ code: "TIMEOUT" }); expect(fetcher).not.toHaveBeenCalled(); });
});
it("keeps business semantics independent from the capacity budget",async()=>{
  const fetcher=vi.fn().mockImplementation(()=>response());vi.stubGlobal('fetch',fetcher);
  await prioritize(demoInput);await prioritize({...demoInput,people:1,workdays:3});
  const first=JSON.parse(fetcher.mock.calls[0][1].body).messages;
  const second=JSON.parse(fetcher.mock.calls[1][1].body).messages;
  expect(first).toEqual(second);expect(first[1].content).not.toContain('capacityDays');expect(first[1].content).not.toContain('workdays');
});
it('sends only original clauses and materializes indexed evidence through the SDK',async()=>{
  const original=modelResult();
  const indexed={...original,items:original.items.map(r=>({...r,links:r.links.map(l=>({goalId:l.goalId,kind:l.kind,source:'desc'})),dependencies:r.dependencies.map(d=>({toId:d.toId,kind:d.kind,clauseIndex:0}))}))};
  const fetcher=vi.fn().mockResolvedValue(response(completion(JSON.stringify(indexed))));vi.stubGlobal('fetch',fetcher);
  const out=await POST(request());expect(out.status).toBe(200);const result=await out.json();expect(result.dependencies[0].quote).toBe(demoInput.requirements[2].desc);
  const payload=JSON.parse(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content);
  expect(payload.requirements[2].clauses).toEqual([demoInput.requirements[2].desc]);expect(Object.keys(payload).sort()).toEqual(['goals','requirements']);
});
it('enforces exclusion through the API without removing or biasing model inputs',async()=>{
  const fetcher=vi.fn().mockImplementation(()=>response());vi.stubGlobal('fetch',fetcher);
  const input={...demoInput,requirements:demoInput.requirements.map(r=>({...r,excluded:r.id==='r2'}))};
  const result=await POST(request(input));expect(result.status).toBe(200);const output=await result.json();
  expect(output.feasibility).toBe('infeasible');expect(output.must).toEqual([]);
  expect(output.wont.map((r:{id:string})=>r.id)).toContain('r2');
  expect(output.candidates.map((r:{id:string})=>r.id)).toEqual(['r1']);
  expect(output.goalConflicts.map((g:{goalId:string})=>g.goalId)).toEqual(['g2','g3']);
  await POST(request(demoInput));
  expect(JSON.parse(fetcher.mock.calls[0][1].body).messages).toEqual(JSON.parse(fetcher.mock.calls[1][1].body).messages);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects malformed exclusion before contacting the provider',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const input=structuredClone(demoInput);Object.assign(input.requirements[0],{excluded:'false'});
  const result=await POST(request(input));expect(result.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});
it('does not accept historical analysis without scope through the real API parser',async()=>{
  const body=completion();body.choices[0].message.content=JSON.stringify(modelResult());
  const fetcher=vi.fn().mockImplementation(()=>response(body));vi.stubGlobal('fetch',fetcher);
  const result=await POST(request());expect(result.status).toBe(502);
  expect((await result.json()).error.code).toBe('INVALID_SCOPE');expect(fetcher).toHaveBeenCalledTimes(2);
});
it('removes unsupported expansion links in an SDK response while preserving all rows',async()=>{
  const body=completion();const a=JSON.parse(body.choices[0].message.content);
  for(const id of ['r8','r9']){
    const row=a.items.find((r:{id:string})=>r.id===id);
    row.scope=id==='r8'?'operation':'presentation';row.links=[{goalId:'g1',kind:id==='r8'?'supporting':'optional',source:'desc',goalAction:'报名'}];
  }
  body.choices[0].message.content=JSON.stringify(a);
  const fetcher=vi.fn().mockResolvedValue(response(body));vi.stubGlobal('fetch',fetcher);
  const responseOut=await POST(request());expect(responseOut.status).toBe(200);const out=await responseOut.json();
  expect(out.wont.map((r:{id:string})=>r.id)).toEqual(expect.arrayContaining(['r8','r9']));expect(out.must).toHaveLength(3);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not contact the provider when the public demo is closed', async () => {
  vi.stubEnv('WHITESPACE_DEMO_MODE','true');vi.stubEnv('WHITESPACE_DEMO_ENABLED','false');
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const out=await POST(request());expect(out.status).toBe(503);expect((await out.json()).error.code).toBe('DEMO_CLOSED');expect(fetcher).not.toHaveBeenCalled();
});
it('rejects oversized public input before a paid request', async () => {
  vi.stubEnv('WHITESPACE_DEMO_MODE','true');vi.stubEnv('WHITESPACE_DEMO_ENABLED','true');
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const out=await POST(request({...demoInput,success:'字'.repeat(1001)}));expect(out.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});

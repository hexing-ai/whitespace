import { expect, it, vi } from "vitest";
vi.mock("openai", () => ({ default: class { constructor() { throw new Error("private initialization details"); } } }));
import { prioritize } from "../src/lib/qwen";
import { demoInput } from "../src/lib/demo";
it("turns SDK construction failure into a safe Chinese error", async () => {
  vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
  try { await expect(prioritize(demoInput)).rejects.toMatchObject({ code: "SDK_INIT", message: "百炼客户端初始化失败，请检查服务端配置。", status: 503 }); }
  finally { vi.unstubAllEnvs(); }
});

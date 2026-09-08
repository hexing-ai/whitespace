import { parseSuccess } from "./goals";
import OpenAI from "openai";
import { goalActions } from "./scope-policy";
import { dependencyClauses } from "./dependency-policy";
import { WhiteSpaceError, splitGoals, parseResult, type PrioritizeInput, type PrioritizeOutput } from "./schema";
import { SYSTEM_PROMPT, PROMPT_VERSION } from "./prompt";

const urls = ["https://dashscope.aliyuncs.com/compatible-mode/v1", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"];
const models = ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-plus-latest", "qwen3.6-plus", "qwen3.6-flash"];
export function configuration(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) throw new WhiteSpaceError("MISSING_KEY", "未配置 DASHSCOPE_API_KEY，请在 .env.local 填写阿里云百炼 Key。", 503);
  const baseURL = env.DASHSCOPE_BASE_URL || urls[0];
  const model = env.DASHSCOPE_MODEL || "qwen3.6-plus";
  if (!urls.includes(baseURL)) throw new WhiteSpaceError("INVALID_CONFIG", "百炼地址配置不正确，请使用北京或国际站 compatible-mode 地址。", 503);
  if (!models.includes(model)) throw new WhiteSpaceError("INVALID_CONFIG", "模型配置不正确，请使用允许的通义千问模型。", 503);
  const timeout = Number(env.DASHSCOPE_TIMEOUT_MS || 30000);
  const temperature = Number(env.DASHSCOPE_TEMPERATURE || 0.2);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30000 || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new WhiteSpaceError("INVALID_CONFIG", "模型超时或温度配置不正确。", 503);
  return { apiKey, baseURL, model, timeout, temperature };
}
export function publicError(error: unknown): WhiteSpaceError {
  if (error instanceof WhiteSpaceError) return error;
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) return new WhiteSpaceError("AUTH_FAILED", "百炼认证失败，请检查 Key、地域和模型访问权限。", 502);
    if (error.status === 429) return new WhiteSpaceError("RATE_LIMITED", "百炼请求受限，请稍后重试或检查账户额度。", 503);
    if (error.status && error.status >= 400 && error.status < 500) return new WhiteSpaceError("PROVIDER_REJECTED", "百炼未接受请求，请检查模型配置与账户权限。", 502);
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) return new WhiteSpaceError("TIMEOUT", "生成超时，请稍后重新生成。", 504);
  if (error instanceof OpenAI.APIConnectionError) return new WhiteSpaceError("NETWORK_ERROR", "暂时无法连接百炼，请检查网络后重试。", 502);
  return new WhiteSpaceError("PROVIDER_ERROR", "生成暂时失败，请稍后重试。", 502);
}
export async function prioritize(input: PrioritizeInput, signal?: AbortSignal, requestId = crypto.randomUUID()): Promise<PrioritizeOutput> {
  const config = configuration();
  const started = Date.now();
  const budget = AbortSignal.timeout(65000);
  const combined = signal ? AbortSignal.any([signal, budget]) : budget;
  let client: OpenAI;
  try {
    client = new OpenAI({ ...config, maxRetries: 0, fetch: (url, init) => fetch(url, { ...init, redirect: "error" }) });
  } catch { throw new WhiteSpaceError("SDK_INIT", "百炼客户端初始化失败，请检查服务端配置。", 503); }
  let correction = "";
  let previousOutput = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let tokens: OpenAI.Completions.CompletionUsage | undefined;
    const attemptStarted = Date.now();
    try {
      combined.throwIfAborted();
      const completion = await client.chat.completions.create({
        model: config.model, temperature: config.temperature, max_tokens: 6000,
        ...{ enable_thinking: false },
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ ...(parseSuccess(input.success).scopeConstraints.length ? { scopeConstraints: parseSuccess(input.success).scopeConstraints } : {}), goals: splitGoals(input.success).map(g=>({...g,actions:goalActions(g.text)})), requirements: input.requirements.map(r=>({id:r.id,name:r.name,desc:r.desc,estimateDays:r.estimateDays,clauses:dependencyClauses(r.desc).map(c=>c.text),clausePolicy:dependencyClauses(r.desc).map(c=>c.certainty)})) }) },
          ...(correction ? [
            { role: "assistant" as const, content: previousOutput },
            { role: "user" as const, content: `上次结果未通过检查：${correction} 请修正上面的分析并重新输出全部需求的完整 JSON。每个输入ID只能出现一次；scope与actionIndex必须完整，需求依据只填source字段，依赖依据只填clauseIndex；不要输出排期、理由或警告。` },
          ] : []),
        ],
      }, { signal: combined, timeout: config.timeout });
      tokens = completion.usage;
      previousOutput = completion.choices[0]?.message.content || "";
      if (completion.choices[0]?.finish_reason !== "stop") throw new WhiteSpaceError("INVALID_STRUCTURE", "模型输出未完整结束，请重新生成。", 502);
      const result = parseResult(previousOutput, input, true);
      console.info(JSON.stringify({ event: "qwen_call", requestId, promptVersion: PROMPT_VERSION, model: completion.model, configuredModel: config.model, attempt, durationMs: Date.now() - attemptStarted, totalMs: Date.now() - started, tokens, outcome: "valid" }));
      return result;
    } catch (error) {
      const safe = publicError(error);
      console.info(JSON.stringify({ event: "qwen_call", requestId, promptVersion: PROMPT_VERSION, model: config.model, attempt, durationMs: Date.now() - attemptStarted, tokens, outcome: safe.code }));
      if (attempt === 2 || combined.aborted || ["AUTH_FAILED", "INVALID_CONFIG", "PROVIDER_REJECTED"].includes(safe.code)) throw safe;
      if (safe.code.startsWith("INVALID_")) correction = safe.message;
    }
  }
  throw new WhiteSpaceError("PROVIDER_ERROR", "生成失败，请稍后重试。", 502);
}

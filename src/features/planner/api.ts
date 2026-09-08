import type { PrioritizeInput, PrioritizeOutput } from "@/lib/contracts";

export class PlannerApiError extends Error {
  constructor(message: string, readonly code: string, readonly requestId?: string) {
    super(message);
    this.name = "PlannerApiError";
  }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(string);
const oneOf = (value: unknown, options: readonly string[]) => string(value) && options.includes(value);
const rows = (value: unknown) => Array.isArray(value) && value.every(row => object(row) && string(row.id) && string(row.name) && oneOf(row.moscow, ["must", "should", "could", "wont"]) && number(row.estimateDays) && string(row.reason));

// Validate the transport contract only. Planning decisions remain on the server.
export function decodePlan(value: unknown): PrioritizeOutput {
  const valid = object(value)
    && [value.capacityDays, value.mustDays, value.candidateDays].every(number)
    && [value.must, value.should, value.could, value.wont, value.candidates].every(rows)
    && oneOf(value.feasibility, ["feasible", "infeasible", "needs_confirmation"])
    && [value.essentialIds, value.unmetSuccess, value.warnings, value.needsConfirmation].every(strings)
    && string(value.meetingNote)
    && Array.isArray(value.goalCoverage) && value.goalCoverage.every(goal => object(goal)
      && string(goal.id) && string(goal.text) && strings(goal.requiredIds) && strings(goal.missingIds)
      && oneOf(goal.status, ["committed", "candidate", "blocked", "missing", "needs_confirmation", "conflict"])
      && Array.isArray(goal.evidence) && goal.evidence.every(evidence => object(evidence)
        && string(evidence.requirementId) && string(evidence.quote)
        && oneOf(evidence.kind, ["required", "supporting", "optional"])
        && (evidence.goalAction === undefined || string(evidence.goalAction))))
    && Array.isArray(value.dependencies) && value.dependencies.every(dep => object(dep)
      && string(dep.fromId) && (dep.toId === null || string(dep.toId))
      && oneOf(dep.kind, ["explicit", "uncertain"]) && string(dep.quote))
    && Array.isArray(value.goalConflicts) && value.goalConflicts.every(conflict => object(conflict)
      && string(conflict.goalId) && strings(conflict.excludedIds) && string(conflict.message));
  if (!valid) throw new PlannerApiError("服务返回的范围格式异常，请重新生成。", "INVALID_RESPONSE");
  return value as PrioritizeOutput;
}

export async function requestPlan(input: PrioritizeInput, signal: AbortSignal): Promise<{ plan: PrioritizeOutput; requestId?: string }> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 70_000);
  let requestId: string | undefined;
  try {
    const response = await fetch("/api/prioritize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input), cache: "no-store",
      signal: AbortSignal.any([signal, timeout.signal]),
    });
    requestId = response.headers.get("X-Request-Id") ?? undefined;
    if (response.status === 429) throw new PlannerApiError("公共演示请求过于频繁或暂时繁忙，请稍后重试。", "RATE_LIMITED", requestId);
    const data: unknown = await response.json().catch(() => {
      throw new PlannerApiError("服务返回了无效内容，请稍后重试。", "INVALID_RESPONSE", requestId);
    });
    if (!response.ok) {
      const error = object(data) && object(data.error) ? data.error : null;
      throw new PlannerApiError(error && string(error.message) ? error.message : "生成失败，请稍后重试。", error && string(error.code) ? error.code : "HTTP_ERROR", requestId);
    }
    return { plan: decodePlan(data), requestId };
  } catch (error) {
    if (signal.aborted) throw new PlannerApiError("本次等待已结束。", "CANCELLED", requestId);
    if (timeout.signal.aborted) throw new PlannerApiError("生成超时，请稍后重新生成。", "TIMEOUT", requestId);
    if (error instanceof PlannerApiError) throw new PlannerApiError(error.message, error.code, requestId);
    throw new PlannerApiError("网络连接中断，请检查网络后重试。", "NETWORK_ERROR", requestId);
  } finally { clearTimeout(timer); }
}

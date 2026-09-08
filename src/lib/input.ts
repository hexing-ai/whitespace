import Decimal from "decimal.js";
import { splitGoals } from "./goals";
import type { PrioritizeInput } from "./contracts";
Decimal.set({ precision: 700 });
export class WhiteSpaceError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WhiteSpaceError("INVALID_STRUCTURE", "数据格式不正确，请重新生成。", 502);
  return value as Record<string, unknown>;
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER; }
export function capacityFor(people: number, workdays: number): number {
  const result = new Decimal(people).mul(workdays).mul("0.7").toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  if (!result.isFinite() || result.gt(Number.MAX_SAFE_INTEGER)) throw new WhiteSpaceError("INVALID_INPUT", "人数与工作日的乘积过大，请调小后重试。", 400);
  return result.toNumber();
}
export function validateInput(value: unknown): PrioritizeInput {
  let data: Record<string, unknown>;
  try { data = object(value); } catch { throw new WhiteSpaceError("INVALID_INPUT", "请输入有效的规划内容。", 400); }
  if (!positive(data.people) || !positive(data.workdays)) throw new WhiteSpaceError("INVALID_INPUT", "人数和工作日必须是有效正数。", 400);
  if (!nonempty(data.success) || !data.success.replace(/[；;。\n\r，,、]/g," ").trim()) throw new WhiteSpaceError("INVALID_INPUT", "请填写成功标准。", 400);
  if (!splitGoals(data.success).length) throw new WhiteSpaceError("INVALID_INPUT", "请填写至少一项要达成的成功标准，不能只有本期不做的范围。", 400);
  if (!Array.isArray(data.requirements) || data.requirements.length < 2) throw new WhiteSpaceError("INVALID_INPUT", "请至少填写两条需求。", 400);
  const ids = new Set<string>();
  const requirements = data.requirements.map((item) => {
    let row: Record<string, unknown>;
    try { row = object(item); } catch { throw new WhiteSpaceError("INVALID_INPUT", "每条需求必须是有效的需求对象。", 400); }
    if (!nonempty(row.id) || ids.has(row.id) || !nonempty(row.name) || typeof row.desc !== "string") throw new WhiteSpaceError("INVALID_INPUT", "每条需求须有唯一编号、名称和文字说明（说明可空）。", 400);
    if (row.estimateDays != null && !positive(row.estimateDays)) throw new WhiteSpaceError("INVALID_INPUT", "预估人天请留空或填写有效正数，不能填 0。", 400);
    if (row.excluded !== undefined && typeof row.excluded !== "boolean") throw new WhiteSpaceError("INVALID_INPUT", "本期明确不做标记必须为布尔值。", 400);
    ids.add(row.id);
    return { id: row.id, name: row.name, desc: row.desc, estimateDays: row.estimateDays as number | null | undefined, excluded: row.excluded === true };
  });
  capacityFor(data.people, data.workdays);
  return { people: data.people, workdays: data.workdays, success: data.success.trim(), requirements };
}

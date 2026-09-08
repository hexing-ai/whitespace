import type { PrioritizeInput } from "@/lib/contracts";

export type DraftRow = { id: string; name: string; desc: string; estimate: string; excluded: boolean };
export type Draft = { people: string; workdays: string; success: string; requirements: DraftRow[] };
export type FieldErrors = Record<string, string>;
export const preferenceKey = "whitespace:skip-intro:v1";
export function initialDraft(): Draft {
  return { people: "5", workdays: "10", success: "", requirements: ["r1", "r2"].map(id => ({ id, name: "", desc: "", estimate: "", excluded: false })) };
}
export function draftFrom(input: PrioritizeInput): Draft {
  return { people: String(input.people), workdays: String(input.workdays), success: input.success,
    requirements: input.requirements.map(row => ({ id: row.id, name: row.name, desc: row.desc, estimate: row.estimateDays == null ? "" : String(row.estimateDays), excluded: row.excluded === true })) };
}
const positive = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= Number.MAX_SAFE_INTEGER;
export function validateDraft(draft: Draft, stage: "conditions" | "all"): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.success.trim()) errors.success = "请填写具体成功标准，不能只有空格。";
  for (const key of ["people", "workdays"] as const) if (!positive(draft[key])) errors[key] = "请填写安全范围内的正数。";
  if (stage === "all") {
    if (draft.requirements.length < 2) errors.requirements = "请至少填写两条需求，再生成范围。";
    for (const row of draft.requirements) {
      if (!row.name.trim()) errors[`name-${row.id}`] = "请填写需求名称，不能只有空格。";
      if (row.estimate !== "" && !positive(row.estimate)) errors[`estimate-${row.id}`] = "预估人天请留空或填写有效正数。";
    }
  }
  return errors;
}
export function serializeDraft(draft: Draft): PrioritizeInput {
  return { people: Number(draft.people), workdays: Number(draft.workdays), success: draft.success,
    requirements: draft.requirements.map(row => ({ id: row.id, name: row.name, desc: row.desc, estimateDays: row.estimate === "" ? null : Number(row.estimate), excluded: row.excluded })) };
}

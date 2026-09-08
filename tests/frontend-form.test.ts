import { expect, it } from "vitest";
import { draftFrom, initialDraft, serializeDraft, validateDraft } from "../src/features/planner/form";
import { demoInput } from "../src/lib/demo";

it("checks conditions separately from required rows", () => {
  const draft = initialDraft(); draft.success = "用户完成报名";
  expect(validateDraft(draft, "conditions")).toEqual({});
  expect(validateDraft(draft, "all")).toEqual({ "name-r1": "请填写需求名称，不能只有空格。", "name-r2": "请填写需求名称，不能只有空格。" });
});
for (const value of ["", "0", "-1", "Infinity", "9007199254740992"]) it(`rejects invalid positive field ${JSON.stringify(value)}`, () => {
  const draft = draftFrom(demoInput); draft.people = value;
  expect(validateDraft(draft, "all").people).toBeTruthy();
});
it("preserves decimal values, IDs and exclusions and converts only empty estimates to null", () => {
  const draft = draftFrom(demoInput); draft.people = "0.5"; draft.workdays = "2.5";
  draft.requirements[0].estimate = ""; draft.requirements[1].estimate = "0.25"; draft.requirements[1].excluded = true;
  expect(validateDraft(draft, "all")).toEqual({});
  const submitted = serializeDraft(draft);
  expect(submitted.people).toBe(0.5); expect(submitted.workdays).toBe(2.5);
  expect(submitted.requirements[0].estimateDays).toBeNull();
  expect(submitted.requirements[1]).toEqual({ ...demoInput.requirements[1], estimateDays: 0.25, excluded: true });
  expect(draft.requirements[0].estimate).toBe("");
});
it("rejects too few rows and whitespace-only content before submission", () => {
  const draft = initialDraft(); draft.success = " "; draft.requirements = [draft.requirements[0]];
  expect(validateDraft(draft, "all")).toHaveProperty("requirements");
  expect(validateDraft(draft, "all")).toHaveProperty("success");
});

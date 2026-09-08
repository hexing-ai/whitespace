import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlanResults } from "../src/features/planner/plan-results";
import { demoInput } from "../src/lib/demo";
import { validOutput } from "./fixtures";

it("shows each distinct reason once without dropping a confirmation", () => {
  const result = { ...validOutput(), feasibility: "infeasible" as const,
    goalConflicts: [{ goalId: "g1", excludedIds: ["r1"], message: "必要工作被排除" }],
    unmetSuccess: ["必要工作被排除", "另一个目标缺口"],
    warnings: ["必要工作被排除", "另一个目标缺口", "需要核实估值", "需要核实估值"],
    needsConfirmation: ["需要核实估值", "还需核实授权", "还需核实授权"],
  };
  const html = renderToStaticMarkup(createElement(PlanResults, { result, input: demoInput, note: "", copyStatus: "", copy() {}, setNote() {}, setCopyStatus() {} }));
  for (const message of ["必要工作被排除", "另一个目标缺口", "需要核实估值", "还需核实授权"])
    expect(html.split(message).length - 1).toBe(1);
});

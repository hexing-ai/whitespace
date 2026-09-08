export type Moscow = "must" | "should" | "could" | "wont";
export type RequirementIn = { id: string; name: string; desc: string; estimateDays?: number | null; excluded?: boolean };
export type RequirementOut = { id: string; name: string; moscow: Moscow; estimateDays: number; reason: string };
export type PrioritizeInput = { people: number; workdays: number; success: string; requirements: RequirementIn[] };
export type Goal = { id: string; text: string };
export type ScopeKind = "core" | "operation" | "presentation" | "incentive" | "audience" | "extension";
export type GoalLink = { goalId: string; kind: "required" | "supporting" | "optional"; quote: string; goalAction?: string };
export type Dependency = { fromId: string; toId: string | null; kind: "explicit" | "uncertain"; quote: string };
export type AnalysisItem = { id: string; estimateDays: number; links: GoalLink[]; dependencies: Dependency[]; scopeKinds?: ScopeKind[] };
export type Analysis = { items: AnalysisItem[]; goalGaps: { goalId: string; kind: "missing" | "uncertain" }[] };
export type GoalCoverage = Goal & {
  requiredIds: string[];
  status: "committed" | "candidate" | "blocked" | "missing" | "needs_confirmation" | "conflict";
  missingIds: string[];
  evidence: { requirementId: string; kind: GoalLink["kind"]; quote: string; goalAction?: string }[];
};
export type GoalConflict = { goalId: string; excludedIds: string[]; message: string };
export type PrioritizeOutput = {
  capacityDays: number; mustDays: number;
  must: RequirementOut[]; should: RequirementOut[]; could: RequirementOut[]; wont: RequirementOut[];
  feasibility: "feasible" | "infeasible" | "needs_confirmation";
  essentialIds: string[]; unmetSuccess: string[]; meetingNote: string; warnings: string[];
  candidates: RequirementOut[]; candidateDays: number;
  goalCoverage: GoalCoverage[]; dependencies: Dependency[]; needsConfirmation: string[]; goalConflicts: GoalConflict[];
};

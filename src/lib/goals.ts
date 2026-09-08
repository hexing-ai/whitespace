import type { Goal } from "./contracts";

// Only explicit scope exclusions are separated. Safety requirements and mixed
// clauses stay in the goal list; a negative word alone does not remove a goal.
function standaloneExclusion(text: string): boolean {
  if (/但|而|并|且|同时|以及|还能|也能|即可|才能|才可|时|之后|以后/.test(text.replace(/^暂时/, ""))) return false;
  if (/未授权|未经|未登录|非法|越权|泄露|丢失|重复提交|错误|失败/.test(text)) return false;
  const explicit = /^(?:(?:本期|这期|本次|此次|当前版本)(?:暂时|暂)?(?:不再|暂不|不)|暂时不|暂不)(?:做|开发|增加|新增|提供|支持|接入|上线|启用|开放|发放|发送|发|扩大|包含|考虑|建设|实现|引入|纳入)\S+/;
  return explicit.test(text) || /^(?:不做|不开发|不纳入)\S+/.test(text);
}

export function parseSuccess(success: string): { goals: Goal[]; scopeConstraints: string[] } {
  const parts = success.split(/[；;。\n\r，,、]+/).map(text => text.trim()).filter(Boolean);
  const scopeConstraints = parts.filter(standaloneExclusion);
  const goals = parts.filter(text => !standaloneExclusion(text)).map((text, index) => ({ id: `g${index + 1}`, text }));
  return { goals, scopeConstraints };
}

export function splitGoals(success: string): Goal[] { return parseSuccess(success).goals; }

import Decimal from "decimal.js";
import { applyScopePolicy, scopeReason, goalActions, positiveQuote } from "./scope-policy";
import { dependencyClauses, validateDependencies } from "./dependency-policy";
import { capacityFor, WhiteSpaceError } from "./input";
import type { Analysis, AnalysisItem, Dependency, GoalCoverage, GoalLink, Moscow, PrioritizeInput, PrioritizeOutput, RequirementOut } from "./contracts";
const categories: Moscow[] = ["must", "should", "could", "wont"];
const oneLine = (s: string) => s.replace(/[\r\n\u2028\u2029]+/g, " ");
export { splitGoals } from "./goals";
import { splitGoals } from "./goals";

function fail(message: string, code = "INVALID_STRUCTURE"): never { throw new WhiteSpaceError(code, message, 502); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("模型返回的数据对象不完整，请重新生成。");
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] { if (!Array.isArray(value)) fail("模型返回的列表不完整，请重新生成。"); return value; }
function text(value: unknown): string { if (typeof value !== "string" || !value.trim()) fail("模型返回的编号或原文依据为空，请重新生成。"); return value; }
export function analyzeOutput(raw: string, input: PrioritizeInput, strictScope = false): Analysis {
  let data: Record<string, unknown>;
  try { data=record(JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,"$1"))); }
  catch(error) { if(error instanceof WhiteSpaceError) throw error; fail("模型没有返回完整数据，请重新生成。","INVALID_JSON"); }
  const sources=new Map(input.requirements.map(r=>[r.id,r]));
  const goals=new Set(splitGoals(input.success).map(g=>g.id));
  const seen=new Set<string>();
  const items: AnalysisItem[]=list(data.items).map(value=>{
    const row=record(value); const id=text(row.id); const source=sources.get(id);
    if(!source || seen.has(id)) fail("模型返回了未知或重复需求，请只使用原始输入编号且每项出现一次。","INVALID_BUSINESS");
    seen.add(id);
    const estimate=source.estimateDays ?? row.estimateDays;
    if(typeof estimate!=="number" || !Number.isFinite(estimate) || estimate<=0 || estimate>Number.MAX_SAFE_INTEGER || (source.estimateDays==null && !Number.isInteger(estimate))) fail("缺失的人天须补为有效正整数，请重新生成。","INVALID_BUSINESS");
    if(source.estimateDays!=null && row.estimateDays!=null && row.estimateDays!==source.estimateDays) fail("模型修改了已填写的人天，请保留原始估值。","INVALID_BUSINESS");
    const verifyQuote=(v:unknown)=>{ const quote=text(v); if(!source.name.includes(quote)&&!source.desc.includes(quote)) fail("模型的依据未出现在对应需求原文中，请使用可核对的原文摘录。","INVALID_EVIDENCE"); return quote; };
    const linked=new Set<string>();
    const links:GoalLink[]=list(row.links).map(value=>{
      const link=record(value);const goalId=text(link.goalId);
      if(!goals.has(goalId)||linked.has(goalId)||!["required","supporting","optional"].includes(String(link.kind))) fail("模型的目标对应关系有未知编号、重复项或非法类型。","INVALID_BUSINESS");
      let quote:string;
      if(link.source!==undefined){
        if(!["name","desc"].includes(String(link.source))||link.quote!==undefined)fail("目标依据须选择name或desc字段，不可同时返回自由引用。","INVALID_EVIDENCE");
        quote=text(source[link.source as "name"|"desc"]);
      }else quote=verifyQuote(link.quote);
      let goalAction=link.goalAction===undefined?undefined:text(link.goalAction);
      if(link.actionIndex!==undefined){
        const actions=goalActions(splitGoals(input.success).find(g=>g.id===goalId)!.text);
        if(typeof link.actionIndex!=="number"||!Number.isInteger(link.actionIndex)||link.actionIndex<0||link.actionIndex>=actions.length||goalAction!==undefined)fail("目标依据须选择有效actionIndex，不可同时返回自由引用。","INVALID_SCOPE");
        goalAction=actions[link.actionIndex];
      }
      linked.add(goalId);return {goalId,kind:link.kind as GoalLink["kind"],quote,...(goalAction!==undefined?{goalAction}:{})};
    });
    const depends=new Set<string>();
    const dependencies:Dependency[]=list(row.dependencies).map(value=>{
      const dep=record(value);const toId=dep.toId===null?null:text(dep.toId);
      if(!["explicit","uncertain"].includes(String(dep.kind)) || (dep.kind==="explicit" && (!toId || !sources.has(toId))) || (toId!==null&&!sources.has(toId))) fail("依赖必须指向原始需求；无法确认的外部依赖请标记待确认。","INVALID_BUSINESS");
      const key=`${dep.kind}:${toId}`;if(depends.has(key)) fail("模型重复列出了依赖关系。","INVALID_BUSINESS");depends.add(key);
      let quote:string;
      if(dep.clauseIndex!==undefined){
        const clauses=dependencyClauses(source.desc);
        if(typeof dep.clauseIndex!=="number"||!Number.isInteger(dep.clauseIndex)||dep.clauseIndex<0||dep.clauseIndex>=clauses.length||dep.quote!==undefined)fail("依赖依据须选择本条说明中有效的条件编号，不可同时返回自由引用。","INVALID_EVIDENCE");
        quote=clauses[dep.clauseIndex].text;
      }else quote=verifyQuote(dep.quote);
      return {fromId:id,toId,kind:dep.kind as Dependency["kind"],quote};
    });
    validateDependencies(source.desc,dependencies);
    for(const dep of dependencies){
      const condition=dependencyClauses(source.desc).filter(c=>c.certainty!=="related"&&dep.quote.includes(c.condition)).map(c=>c.condition).join("；");
      const named=input.requirements.filter(r=>r.id!==id&&condition.includes(r.name));
      if(named.length===1){
        if(dep.toId!==null&&dep.toId!==named[0].id)fail("依赖对象与条件中唯一出现的需求名称不一致，请核对编号。","INVALID_DEPENDENCY");
        dep.toId=named[0].id;
      }
    }
    return {id,estimateDays:estimate,...applyScopePolicy(source,row.scope,links,splitGoals(input.success),strictScope),dependencies};
  });
  if(seen.size!==sources.size) fail("模型遗漏了输入需求，请重新生成完整列表。","INVALID_BUSINESS");
  const gapIds=new Set<string>();
  const goalGaps=list(data.goalGaps).map(value=>{
    const gap=record(value);const goalId=text(gap.goalId);
    if(!goals.has(goalId)||gapIds.has(goalId)||!["missing","uncertain"].includes(String(gap.kind))) fail("目标缺口标记有未知或重复项。","INVALID_BUSINESS");
    if(gap.kind==="missing"){
      const missingAction=text(gap.missingAction);
      const goal=splitGoals(input.success).find(g=>g.id===goalId)!;
      if(!goal.text.includes(missingAction))fail("功能缺口须指出成功标准原文中未覆盖的动作；外部前置不明只能标为依赖待确认。","INVALID_EVIDENCE");
      if(strictScope&&!positiveQuote(goal.text,missingAction))fail("成功标准中明确不做的能力不能作为缺失功能，请仅核对正向目标。","INVALID_SCOPE");
      const directlyCovered=items.filter(r=>r.links.some(l=>l.goalId===goalId&&l.kind==="required"));
      if(directlyCovered.some(r=>{const source=sources.get(r.id)!;return source.name.includes(missingAction)||source.desc.includes(missingAction);}))fail("所指缺失动作已经出现在直接对应需求中；请勿把前置待确认或循环关系重复标为功能缺失。","INVALID_BUSINESS");
    }
    gapIds.add(goalId);return {goalId,kind:gap.kind as "missing"|"uncertain"};
  });
  return {items,goalGaps};
}
export function resolvePlan(analysis: Analysis,input: PrioritizeInput): PrioritizeOutput {
  const goals=splitGoals(input.success);
  if(!goals.length) throw new WhiteSpaceError("INVALID_INPUT","请填写有实际内容的成功标准。",400);
  const capacityDays=capacityFor(input.people,input.workdays);
  const byId=new Map(analysis.items.map(r=>[r.id,r]));
  const sources=new Map(input.requirements.map(r=>[r.id,r]));
  const dependencies=analysis.items.flatMap(r=>r.dependencies);
  const cycleIds=new Set<string>();
  function closure(start:string): Set<string> {
    const found=new Set<string>();const path:string[]=[];
    function visit(id:string){
      const cycleAt=path.indexOf(id);if(cycleAt>=0){path.slice(cycleAt).forEach(x=>cycleIds.add(x));return;}
      if(found.has(id))return;found.add(id);path.push(id);
      for(const dep of byId.get(id)!.dependencies) if(dep.kind==="explicit"&&dep.toId)visit(dep.toId);
      path.pop();
    }
    visit(start);return found;
  }
  const closures=new Map(analysis.items.map(r=>[r.id,closure(r.id)]));
  const goalIds=new Map(goals.map(g=>[g.id,new Set(analysis.items.filter(r=>r.links.some(l=>l.goalId===g.id&&l.kind==="required")).flatMap(r=>[...closures.get(r.id)!]))]));
  const essential=new Set([...goalIds.values()].flatMap(ids=>[...ids]));
  const sum=(ids:Iterable<string>)=>[...ids].reduce((s,id)=>s.add(byId.get(id)!.estimateDays),new Decimal(0));
  const essentialDays=sum(essential);
  const excluded=new Set(input.requirements.filter(r=>r.excluded===true).map(r=>r.id));
  const hasExcluded=(ids:Iterable<string>)=>[...ids].some(id=>excluded.has(id));
  const goalConflicts:PrioritizeOutput["goalConflicts"]=goals.flatMap(g=>{
    const excludedIds=[...goalIds.get(g.id)!].filter(id=>excluded.has(id));
    if(!excludedIds.length)return [];
    return [{goalId:g.id,excludedIds,message:`目标冲突：「${oneLine(g.text)}」的必要工作包含你已标记本期不做的「${excludedIds.map(id=>oneLine(sources.get(id)!.name)).join("、")}」。请核实必要关系，或调整本期排除项/成功标准后重新生成。`}];
  });
  const conflictByGoal=new Map(goalConflicts.map(c=>[c.goalId,c]));
  const uncertainIds=new Set(dependencies.filter(d=>d.kind==="uncertain").map(d=>d.fromId));
  const blocked=(ids:Iterable<string>)=>[...ids].some(id=>cycleIds.has(id)||uncertainIds.has(id));
  const gapById=new Map(analysis.goalGaps.map(g=>[g.goalId,g.kind]));
  const missingGoals=goals.filter(g=>gapById.get(g.id)==="missing" || (!goalIds.get(g.id)!.size&&gapById.get(g.id)!=="uncertain"));
  const uncertainGoals=goals.filter(g=>gapById.get(g.id)==="uncertain"||blocked(goalIds.get(g.id)!));
  const feasibility:PrioritizeOutput["feasibility"]=goalConflicts.length||missingGoals.length||essential.size>3||essentialDays.gt(capacityDays)?"infeasible":uncertainGoals.length?"needs_confirmation":"feasible";
  const committed=new Set(feasibility==="feasible"?essential:[]);
  const candidateIds=new Set<string>();
  if(feasibility!=="feasible") for(const row of analysis.items){
    if(!essential.has(row.id))continue;
    const batch=closures.get(row.id)!;
    if(blocked(batch)||hasExcluded(batch))continue;
    const combined=new Set([...candidateIds,...batch]);
    if(combined.size<=3&&sum(combined).lte(capacityDays))for(const id of batch)candidateIds.add(id);
  }
  const selected=feasibility==="feasible"?committed:candidateIds;
  const needsConfirmation:string[]=[];
  for(const dep of dependencies.filter(d=>d.kind==="uncertain")) needsConfirmation.push(`「${oneLine(sources.get(dep.fromId)!.name)}」的前置条件待确认：输入提到「${oneLine(dep.quote)}」。`);
  for(const dep of dependencies.filter(d=>d.kind==="uncertain"&&d.toId&&excluded.has(d.toId)&&essential.has(d.fromId))) needsConfirmation.push(`你已标记「${oneLine(sources.get(dep.toId!)!.name)}」本期不做，但它是否是「${oneLine(sources.get(dep.fromId)!.name)}」的必要前置尚待确认；确认前不形成本期承诺。`);
  if(cycleIds.size)needsConfirmation.push(`「${[...cycleIds].map(id=>oneLine(sources.get(id)!.name)).join("、")}」存在循环依赖，需先确认执行先后关系。`);
  for(const goal of uncertainGoals.filter(g=>gapById.get(g.id)==="uncertain"))needsConfirmation.push(`目标「${oneLine(goal.text)}」是否被清单完整覆盖，仍需确认。`);
  const goalCoverage:GoalCoverage[]=goals.map(g=>{
    const ids=goalIds.get(g.id)!;
    const status:GoalCoverage["status"]=conflictByGoal.has(g.id)?"conflict":missingGoals.includes(g)?"missing":uncertainGoals.includes(g)?"needs_confirmation":[...ids].every(id=>committed.has(id))?"committed":[...ids].every(id=>candidateIds.has(id))?"candidate":"blocked";
    return {...g,requiredIds:[...ids],status,missingIds:[...ids].filter(id=>!selected.has(id)),evidence:analysis.items.flatMap(r=>r.links.filter(l=>l.goalId===g.id).map(l=>({requirementId:r.id,kind:l.kind,quote:l.quote,...(l.goalAction?{goalAction:l.goalAction}:{})})))};
  });
  const unmetSuccess=goalCoverage.filter(g=>g.status!=="committed"&&g.status!=="candidate").map(g=>g.status==="conflict"?conflictByGoal.get(g.id)!.message:g.status==="missing"?`清单尚未完整覆盖「${oneLine(g.text)}」。`:g.status==="needs_confirmation"?`「${oneLine(g.text)}」的实现条件待确认。`:`「${oneLine(g.text)}」尚缺必要工作：${g.missingIds.map(id=>oneLine(sources.get(id)!.name)).join("、")}。`);
  const pendingTargets=new Set(dependencies.filter(d=>d.kind==="uncertain"&&d.toId&&essential.has(d.fromId)).map(d=>d.toId!));
  const groups={must:[],should:[],could:[],wont:[]} as Record<Moscow,RequirementOut[]>;
  for(const row of analysis.items){
    const name=sources.get(row.id)!.name;
    const targets=goals.filter(g=>goalIds.get(g.id)!.has(row.id)).map(g=>oneLine(g.text));
    const related=goals.filter(g=>row.links.some(l=>l.goalId===g.id)).map(g=>oneLine(g.text));
    const category:Moscow=excluded.has(row.id)?"wont":committed.has(row.id)?"must":essential.has(row.id)||pendingTargets.has(row.id)||row.links.some(l=>l.kind==="supporting")?"should":row.links.some(l=>l.kind==="optional")?"could":"wont";
    let reason:string;
    if(excluded.has(row.id))reason=`你已标记这项工作本期明确不做，不纳入承诺或部分候选。${essential.has(row.id)?`它仍是「${targets.join("；")}」的必要工作，与目标冲突。`:pendingTargets.has(row.id)?"它与必要工作的前置关系尚待确认。":""}`;
    else if(committed.has(row.id))reason=`达成「${targets.join("；")}」需要这项工作；本期承诺 ${row.estimateDays} 人天。`;
    else if(essential.has(row.id)){
      const constraint=hasExcluded(closures.get(row.id)!)?"它的必要工作包含本期明确排除项，存在目标冲突，不能列入候选。":blocked(closures.get(row.id)!)?"它的前置条件尚未确认，不能列入候选。":candidateIds.has(row.id)?"已列入部分工作候选，尚未承诺。":essentialDays.gt(capacityDays)?`全部必要工作需 ${essentialDays.toString()} 人天，超过本期 ${capacityDays} 人天上限，尚未承诺。`:essential.size>3?`共有 ${essential.size} 项必要工作，超过最多 3 条的限制，尚未承诺。`:"当前尚未形成完整目标的交付承诺。";
      reason=`达成「${targets.join("；")}」仍需要这项工作；${constraint}`;
    }else if(pendingTargets.has(row.id))reason="这项工作被提到为必要工作的待确认前置，是否需要尚未确认，留待讨论，本期未承诺。";
    else if(category==="should")reason=`它与「${related.join("；")}」相关，但未被识别为达标必需项，作为候选讨论，本期未承诺。`;
    else if(category==="could")reason=`可在完成「${related.join("；")}」后讨论这项改善，本期未承诺。`;
    else reason=scopeReason(row.scopeKinds)||"当前没有把它对应到已填写的成功标准，这期明确不做。";
    groups[category].push({id:row.id,name,moscow:category,estimateDays:row.estimateDays,reason});
  }
  const warnings:string[]=[];
  for(const r of input.requirements)if(r.estimateDays==null)warnings.push(`「${oneLine(r.name)}」暂估 ${byId.get(r.id)!.estimateDays} 人天，请在会中核实。`);
  if(essentialDays.gt(capacityDays))warnings.push(`全部必要工作合计 ${essentialDays.toString()} 人天，超过本期 ${capacityDays} 人天上限。`);
  if(essential.size>3)warnings.push(`共有 ${essential.size} 条必要工作，超过本期最多 3 条 Must 的限制。`);
  for(const g of missingGoals)warnings.push(`目标「${oneLine(g.text)}」在当前需求清单中仍有功能缺口。`);
  warnings.push(...goalConflicts.map(c=>c.message),...needsConfirmation);
  if(feasibility!=="feasible")warnings.push("当前未形成任何本期承诺；部分候选不代表完整目标可交付，也不代表唯一或最优方案。");
  const rows=categories.flatMap(k=>groups[k]);
  const output:PrioritizeOutput={...groups,capacityDays,mustDays:sum(committed).toNumber(),feasibility,essentialIds:[...essential],unmetSuccess,warnings:[...new Set(warnings)],meetingNote:"",candidates:rows.filter(r=>candidateIds.has(r.id)),candidateDays:sum(candidateIds).toNumber(),goalCoverage,dependencies,goalConflicts,needsConfirmation:[...new Set(needsConfirmation)]};
  output.meetingNote=makeMeetingNote(output,input.success);
  return output;
}
export function makeMeetingNote(result:PrioritizeOutput,success:string):string {
  const names=(rows:RequirementOut[])=>rows.map(r=>oneLine(r.name)).join("、")||"无";
  return [
    result.feasibility==="feasible"?"本期范围建议：以下承诺按当前目标对应关系计算，请在会中核实。":result.feasibility==="needs_confirmation"?"前置条件待确认，当前不形成本期承诺。":"当前约束下无法达成完整成功标准，不形成本期承诺。",
    `成功标准：${oneLine(success)}`,
    `产能上限 ${result.capacityDays} 人天；承诺 ${result.mustDays} 人天；部分候选 ${result.candidateDays} 人天。`,
    `本期承诺：${names(result.must)}`,
    `部分工作候选（非承诺）：${names(result.candidates)}`,
    `其他讨论项（非承诺）：${names([...result.should,...result.could].filter(r=>!result.candidates.some(c=>c.id===r.id)))}`,
    `这期明确不做：${names(result.wont)}`,
    result.unmetSuccess.length||result.needsConfirmation.length?`缺口与待确认：${[...result.unmetSuccess,...result.needsConfirmation].map(oneLine).join("；")}`:"当前目标已对应到承诺范围；估算与对应依据需会中核实。",
  ].join("\n");
}
export function parseAnalysisResult(raw:string,input:PrioritizeInput,strictScope=false):PrioritizeOutput { return resolvePlan(analyzeOutput(raw,input,strictScope),input); }

import fixtures from './cases.v1.json';
export function oracleAnalysis(c:typeof fixtures.cases[number]) {
  return {items:c.input.requirements.map(r=>({id:r.id,estimateDays:r.estimateDays??2,links:c.expected.goalRequired.flatMap((ids,i)=>ids.includes(r.id)?[{goalId:`g${i+1}`,kind:'required',quote:r.desc}]:[]),dependencies:[...c.expected.dependencyPairs.filter(p=>p[0]===r.id).map(p=>({toId:p[1] as string|null,kind:'explicit',quote:r.desc})),...(c.id==='unknown_dependency'&&r.id==='f1'?[{toId:null,kind:'uncertain',quote:r.desc}]:[])]})),goalGaps:c.expected.goalRequired.flatMap((ids,i)=>!ids.length?[{goalId:`g${i+1}`,kind:'missing',missingAction:c.input.success}]:[])};
}

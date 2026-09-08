import suite from './cases.v1.json';
export function scopeOracle(c:typeof suite.cases[number]){
  const goals=c.input.success.split(/[；;。\n\r，,、]+/).map(s=>s.trim());
  return {items:c.input.requirements.map((r,index)=>{
    const upstream=new Set(c.oracle.dependencies.filter(d=>d[0]!==r.id).map(d=>d[1]));
    const direct=c.expected.goalRequired.flatMap((ids,i)=>ids.includes(r.id)&&!upstream.has(r.id)?[{goalId:`g${i+1}`,kind:'required'}]:[]);
    const related=(c.oracle.links as Record<string,string[][]>)[r.id]?.map(([goalId,kind])=>({goalId,kind}))||[];
    return {id:r.id,estimateDays:null,scope:c.oracle.scopes[index],links:[...direct,...related].map(l=>({...l,source:'desc',goalAction:goals[Number(l.goalId.slice(1))-1].split('但')[0]})),dependencies:c.oracle.dependencies.filter(d=>d[0]===r.id).map(d=>({toId:d[1],kind:'explicit',clauseIndex:0}))};
  }),goalGaps:[]};
}

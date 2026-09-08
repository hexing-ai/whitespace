import { evaluateCase } from '../evaluation/evaluate.mjs';
const same = (a,b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export function evaluateExclusions(c, output) {
  const base=evaluateCase(c,output);
  if(!base.returned)return base;
  const excluded=c.input.requirements.filter(r=>r.excluded===true).map(r=>r.id);
  const conflicts=output.goalConflicts || [];
  const checks={...base.checks,
    typedDependencies:same(output.dependencies.map(d=>`${d.fromId}>${d.toId}:${d.kind}`),c.expected.typedDependencies.map(([a,b,k])=>`${a}>${b}:${k}`)),
    conflicts:same(conflicts.map(g=>`${g.goalId}:${[...g.excludedIds].sort().join(',')}`),c.expected.conflicts.map(([g,ids])=>`${g}:${[...ids].sort().join(',')}`)),
    conflictStatus:output.goalCoverage.every(g=>(g.status==='conflict')===c.expected.conflicts.some(([id])=>id===g.id)),
    confirmation:(output.needsConfirmation.length>0)===c.expected.needsConfirmation,
    conflictText:conflicts.every(g=>g.message.includes('目标冲突')&&g.excludedIds.every(id=>g.message.includes(c.input.requirements.find(r=>r.id===id).name))&&output.unmetSuccess.includes(g.message)&&output.meetingNote.includes(g.message)),
  };
  const hard={...base.hard,
    exclusion:excluded.every(id=>output.wont.some(r=>r.id===id)&&!output.candidates.some(r=>r.id===id)&&!output.must.some(r=>r.id===id)),
    exclusionReason:excluded.every(id=>output.wont.find(r=>r.id===id)?.reason.includes('你已标记')),
    conflictCommitment:!conflicts.length||(output.feasibility==='infeasible'&&!output.must.length&&output.mustDays===0),
  };
  return {...base,checks,hard,hardInvariants:Object.values(hard).every(Boolean),semantic:Object.values(checks).every(Boolean)};
}

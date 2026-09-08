import { evaluateCase } from '../evaluation/evaluate.mjs';
const equal=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export function evaluateScope(c,out){
  const base=evaluateCase(c,out);if(!base.returned)return base;
  const checks={...base.checks,
    should:equal(out.should.map(r=>r.id),c.expected.shouldIds),
    could:equal(out.could.map(r=>r.id),c.expected.couldIds),
    wont:equal(out.wont.map(r=>r.id),c.expected.wontIds),
  };
  return {...base,checks,semantic:Object.values(checks).every(Boolean)};
}

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import fixtures from './evaluation/cases.v1.json';
import { evaluateCase } from './evaluation/evaluate.mjs';
import { validOutput } from './fixtures';
it('keeps independently frozen inputs and expected results unchanged',()=>{
  const data=readFileSync('tests/evaluation/cases.v1.json');
  expect(createHash('sha256').update(data).digest('hex')).toBe(readFileSync('tests/evaluation/cases.v1.sha256','utf8').trim());
  expect(fixtures.cases).toHaveLength(12);
  for(const c of fixtures.cases) expect(new Set(c.input.requirements.map(r=>r.id)).size).toBe(c.input.requirements.length);
});
it('does not confuse a valid HTTP-shaped result with independently verified goals',()=>{
  expect(evaluateCase(fixtures.cases[0],validOutput()).semantic).toBe(false);
  expect(evaluateCase(fixtures.cases[0],{error:{code:'TIMEOUT'}}).returned).toBe(false);
});
import { parseResult } from '../src/lib/schema';
import { oracleAnalysis } from './evaluation/oracle';
for(const c of fixtures.cases) it(`satisfies frozen rule oracle: ${c.id}`,()=>{
  const result=parseResult(JSON.stringify(oracleAnalysis(c)),c.input);
  const score=evaluateCase(c,result);
  expect(score.hardInvariants,JSON.stringify(score)).toBe(true);
  expect(score.semantic,JSON.stringify(score)).toBe(true);
});
it('rejects a superficially feasible but incomplete goal mapping',()=>{
  const c=fixtures.cases[0];const data=oracleAnalysis(c);data.items[0].links=[];
  expect(evaluateCase(c,parseResult(JSON.stringify(data),c.input)).semantic).toBe(false);
});
it('rejects arithmetic-safe candidates that skip a known prerequisite',()=>{
  const c=fixtures.cases.find(c=>c.id==='dependency_tight')!;const out=parseResult(JSON.stringify(oracleAnalysis(c)),c.input);
  out.candidates=[out.should.find(r=>r.id==='e3')!];out.candidateDays=1;
  expect(evaluateCase(c,out).hard?.dependencyClosure).toBe(false);
});

it('keeps flow support distinct from unrelated work',()=>{
  const out=validOutput();const fixture={input:{people:5,workdays:10,success:'商家能报名、运营能审核、活动能上线',requirements:out.must.concat(out.should,out.could,out.wont).map(r=>({...r,desc:r.name}))},expected:{feasibility:'feasible',essentialIds:['r1','r2','r3'],goalRequired:[['r1'],['r2'],['r2','r3']],wontIds:['r7','r8','r9','r10','r11'],dependencyPairs:[['r3','r2']],relatedIds:['r4','r5','r6','r12']}};
  expect(evaluateCase(fixture,out).checks).toMatchObject({relatedItems:true});
  out.wont.push(...out.should,...out.could);out.should=[];out.could=[];
  expect(evaluateCase(fixture,out).checks).toMatchObject({relatedItems:false});
});

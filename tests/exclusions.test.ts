import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import fixtures from './exclusions/cases.v1.json';
import { evaluateExclusions } from './exclusions/evaluate.mjs';
import { parseResult, validateInput } from '../src/lib/schema';

it('preserves the frozen exclusion scenarios',()=>{
  expect(createHash('sha256').update(readFileSync('tests/exclusions/cases.v1.json')).digest('hex')).toBe(readFileSync('tests/exclusions/cases.v1.sha256','utf8').trim());
  expect(fixtures.cases).toHaveLength(10);
});
for(const c of fixtures.cases)it(`enforces independently specified exclusion results: ${c.id}`,()=>{
  const result=parseResult(JSON.stringify(c.analysis),validateInput(c.input));
  const evaluation=evaluateExclusions(c,result);
  expect(evaluation.hardInvariants,JSON.stringify(evaluation)).toBe(true);
  expect(evaluation.semantic,JSON.stringify(evaluation)).toBe(true);
});
it.each([null,'true','false',1,0,[],{}])('rejects non-boolean exclusion %j',value=>{
  const input=structuredClone(fixtures.cases[0].input);
  Object.assign(input.requirements[0],{excluded:value});
  expect(()=>validateInput(input)).toThrow('本期明确不做');
});
it('makes false equivalent to omission and preserves the original input',()=>{
  const c=fixtures.cases.find(c=>c.id==='exclude_cleared')!;
  const original=JSON.stringify(c);
  const omitted=structuredClone(c.input);delete omitted.requirements[0].excluded;
  expect(parseResult(JSON.stringify(c.analysis),validateInput(c.input))).toEqual(parseResult(JSON.stringify(c.analysis),validateInput(omitted)));
  expect(JSON.stringify(c)).toBe(original);
});
it('independently catches a leaked excluded candidate and a hidden conflict',()=>{
  const c=fixtures.cases.find(c=>c.id==='exclude_transitive')!;
  const result=parseResult(JSON.stringify(c.analysis),validateInput(c.input));
  result.candidates=[result.wont.find(r=>r.id==='r3')!];result.candidateDays=1;
  expect(evaluateExclusions(c,result).hardInvariants).toBe(false);
  Object.assign(result,{goalConflicts:[]});
  expect(evaluateExclusions(c,result).semantic).toBe(false);
});
it.each(['required','supporting','optional','none'])('keeps explicit exclusion above model relation %s',kind=>{
  const c=structuredClone(fixtures.cases[0]);
  c.analysis.items[1].links=kind==='none'?[]:[{goalId:'g1',kind,source:'desc'}];
  const out=parseResult(JSON.stringify(c.analysis),validateInput(c.input));
  expect(out.wont.map(r=>r.id)).toContain('r2');expect(out.candidates.map(r=>r.id)).not.toContain('r2');
  expect(out.feasibility).toBe(kind==='required'?'infeasible':'feasible');
});
it('retains cycle confirmation while exclusion makes the goal definitely infeasible',()=>{
  const c=structuredClone(fixtures.cases.find(c=>c.id==='exclude_transitive')!);
  c.input.requirements[2].desc='只有发布文章完成后才能配置敏感词规则';
  c.analysis.items[2].dependencies=[{toId:'r1',kind:'explicit',clauseIndex:0}];
  const out=parseResult(JSON.stringify(c.analysis),validateInput(c.input));
  expect(out.feasibility).toBe('infeasible');expect(out.candidates).toEqual([]);
  expect(out.goalConflicts).toHaveLength(1);expect(out.needsConfirmation.join('')).toContain('循环');
});
it('rejects omitted or falsely certain whether-needed dependencies',()=>{
  const c=structuredClone(fixtures.cases.find(c=>c.id==='exclude_uncertain')!);
  c.analysis.items[0].dependencies[0].kind='explicit';
  expect(()=>parseResult(JSON.stringify(c.analysis),validateInput(c.input))).toThrow();
  c.analysis.items[0].dependencies=[];
  expect(()=>parseResult(JSON.stringify(c.analysis),validateInput(c.input))).toThrow();
});

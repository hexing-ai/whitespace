import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import suite from './dependencies/cases.v1.json';
import { parseResult } from '../src/lib/schema';
import { evaluateDependencies } from './dependencies/evaluate.mjs';
const analysis = (c:typeof suite.cases[number]) => ({items:c.input.requirements.map(r=>({id:r.id,estimateDays:null,links:r.id==='p2'?[{goalId:'g1',kind:'required',quote:r.desc}]:[],dependencies:c.expected.typedDependencies.filter(d=>d[0]===r.id).map(d=>({toId:d[1],kind:d[2],quote:r.desc}))})),goalGaps:[]});
it('freezes independent dependency cases before implementation',()=>{
  expect(createHash('sha256').update(readFileSync('tests/dependencies/cases.v1.json')).digest('hex')).toBe(readFileSync('tests/dependencies/cases.v1.sha256','utf8').trim());
});
for (const c of suite.cases) it(`dependency rule oracle: ${c.id}`,()=>{
  const score=evaluateDependencies(c,parseResult(JSON.stringify(analysis(c)),c.input));
  expect(score.hardInvariants,JSON.stringify(score)).toBe(true);expect(score.semantic,JSON.stringify(score)).toBe(true);
});
for (const id of ['association_object','negated_dependency','optional_order','event_only']) it(`rejects invented prerequisite: ${id}`,()=>{
  const c=suite.cases.find(c=>c.id===id)!;const a=analysis(c);a.items[1].dependencies=[{toId:'p1',kind:'explicit',quote:c.input.requirements[1].desc}];
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow(/前置|依赖|条件/);
});
it('rejects a negation removed from a verbatim substring',()=>{
  const c=suite.cases.find(c=>c.id==='negated_dependency')!;const a=analysis(c);a.items[1].dependencies=[{toId:'p1',kind:'explicit',quote:'依赖文件校验'}];
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('rejects unconfirmed conditions promoted to definite prerequisites',()=>{
  const c=suite.cases.find(c=>c.id==='information_missing')!;const a=analysis(c);a.items[1].dependencies[0].kind='explicit';
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('rejects omission of an expressly stated prerequisite',()=>{
  const c=suite.cases[0];const a=analysis(c);a.items[1].dependencies=[];
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('requires dependency evidence from the description, not the name',()=>{
  const c=structuredClone(suite.cases[0]);c.input.requirements[1].name='必须等待文件校验';c.input.requirements[1].desc='归档文件。';const a=analysis(c);a.items[1].dependencies[0].quote=c.input.requirements[1].name;
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('does not turn a mandatory feature description into a prerequisite',()=>{
  const c=structuredClone(suite.cases[1]);c.input.requirements[1].desc='必须完成文件归档。';
  expect(parseResult(JSON.stringify(analysis(c)),c.input).feasibility).toBe('feasible');
});
it('does not allow a quote to cover a condition in a different clause',()=>{
  const c=suite.cases[0];const a=analysis(c);a.items[1].dependencies[0].quote='归档文件';
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('accepts a complete condition following a separate action at a comma',()=>{
  const c=structuredClone(suite.cases.find(c=>c.id==='missing_target')!);c.input.requirements[1].desc='归档文件，依赖尚未确认的外部授权服务。';const a=analysis(c);a.items[1].dependencies[0].quote='依赖尚未确认的外部授权服务';
  expect(parseResult(JSON.stringify(a),c.input).feasibility).toBe('needs_confirmation');
});
it('binds a uniquely named but unconfirmed prerequisite without guessing availability',()=>{
  const c=suite.cases.find(c=>c.id==='information_missing')!;const a=analysis(c);a.items[1].dependencies[0].toId=null;
  expect(parseResult(JSON.stringify(a),c.input).dependencies[0]).toMatchObject({kind:'uncertain',toId:'p1'});
});
it('accepts the entire prerequisite predicate without repeating the subject',()=>{
  const c=structuredClone(suite.cases[0]);c.input.requirements[1].desc='文件归档必须在文件校验完成后执行。';const a=analysis(c);a.items[1].dependencies[0].quote='必须在文件校验完成后执行';
  expect(parseResult(JSON.stringify(a),c.input).dependencies[0].toId).toBe('p1');
});
it('preserves uncertainty even when the action subject is omitted',()=>{
  const c=structuredClone(suite.cases.find(c=>c.id==='information_missing')!);c.input.requirements[1].desc='文件归档可能依赖文件校验，是否需要尚未确认。';const a=analysis(c);a.items[1].dependencies[0]={toId:'p1',kind:'explicit',quote:'依赖文件校验'};
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('materializes goal evidence from an allowed source reference',()=>{
  const c=suite.cases[1];const a=analysis(c);Object.assign(a.items[1].links[0],{source:'desc'});Reflect.deleteProperty(a.items[1].links[0],'quote');
  expect(parseResult(JSON.stringify(a),c.input).goalCoverage[0].evidence[0].quote).toBe(c.input.requirements[1].desc);
});
it('materializes a dependency quote from its source clause index',()=>{
  const c=suite.cases[0];const a=analysis(c);Object.assign(a.items[1].dependencies[0],{clauseIndex:1});Reflect.deleteProperty(a.items[1].dependencies[0],'quote');
  expect(parseResult(JSON.stringify(a),c.input).dependencies[0].quote).toBe('必须在文件校验完成后执行');
});
it('rejects invalid source references and clause indexes',()=>{
  const c=suite.cases[0];
  for(const clauseIndex of [-1,99,1.5,'1']){const a=analysis(c);Object.assign(a.items[1].dependencies[0],{clauseIndex});Reflect.deleteProperty(a.items[1].dependencies[0],'quote');expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();}
  const a=analysis(c);Object.assign(a.items[1].links[0],{source:'invented'});Reflect.deleteProperty(a.items[1].links[0],'quote');expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('cannot use a related clause index as dependency evidence',()=>{
  const c=suite.cases[0];const a=analysis(c);Object.assign(a.items[1].dependencies[0],{clauseIndex:0});Reflect.deleteProperty(a.items[1].dependencies[0],'quote');expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('rejects a missing capability not actually named in the goal',()=>{
  const c=suite.cases.find(c=>c.id==='missing_target')!;const a={...analysis(c),goalGaps:[{goalId:'g1',kind:'missing',missingAction:'外部授权服务'}]};
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('rejects calling a directly covered goal action missing',()=>{
  const c=suite.cases.find(c=>c.id==='missing_target')!;const a={...analysis(c),goalGaps:[{goalId:'g1',kind:'missing',missingAction:'归档文件'}]};
  expect(()=>parseResult(JSON.stringify(a),c.input)).toThrow();
});
it('keeps a named unconfirmed prerequisite in discussion consistently',()=>{
  const c=suite.cases.find(c=>c.id==='information_missing')!;const a=analysis(c);
  const first=parseResult(JSON.stringify(a),c.input);expect(first.should.map(r=>r.id)).toContain('p1');expect(first.should.find(r=>r.id==='p1')?.reason).toContain('待确认');
  a.items[0].links=[{goalId:'g1',kind:'supporting',quote:c.input.requirements[0].desc}];
  const second=parseResult(JSON.stringify(a),c.input);expect(second.should.map(r=>r.id)).toEqual(first.should.map(r=>r.id));
});

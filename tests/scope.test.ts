import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect,it } from 'vitest';
import suite from './scope/cases.v1.json';
import { scopeOracle } from './scope/oracle';
import { evaluateScope } from './scope/evaluate.mjs';
import { parseResult } from '../src/lib/schema';
const strict=(raw:unknown,c=suite.cases[0])=>parseResult(JSON.stringify(raw),c.input,true);
it('freezes scope boundary scenarios before implementation',()=>{
  expect(createHash('sha256').update(readFileSync('tests/scope/cases.v1.json')).digest('hex')).toBe(readFileSync('tests/scope/cases.v1.sha256','utf8').trim());
  expect(suite.cases).toHaveLength(16);
});
for(const c of suite.cases)it(`independent scope boundary: ${c.id}`,()=>{
  const out=strict(scopeOracle(c),c);const score=evaluateScope(c,out);
  expect(score.hardInvariants,JSON.stringify(score)).toBe(true);expect(score.semantic,JSON.stringify(score)).toBe(true);
});
it.each(['supporting','optional'])('rejects retaining expansion merely as %s',kind=>{
  const a=scopeOracle(suite.cases[0]);
  for(const row of a.items.slice(1)){row.links=[{goalId:'g1',kind,source:'desc',goalAction:'报名'}];}
  expect(strict(a).wont.map(r=>r.id).sort()).toEqual(['r2','r3']);
});
it.each(['core','operation','presentation'])('does not let scope %s conceal explicit expansion',scope=>{
  const a=scopeOracle(suite.cases[0]);
  for(const row of a.items.slice(1)){row.scope=scope;row.links=[{goalId:'g1',kind:scope==='presentation'?'optional':'supporting',source:'desc',goalAction:'报名'}];}
  expect(strict(a).wont.map(r=>r.id).sort()).toEqual(['r2','r3']);
});
it('rejects an expansion falsely promoted to a required goal action',()=>{
  const a=scopeOracle(suite.cases[0]);a.items[1].links=[{goalId:'g1',kind:'required',source:'desc',goalAction:'报名'}];
  expect(()=>strict(a)).toThrow(/目标|范围/);
});
it('requires the new protocol and a verbatim goal action on every accepted link',()=>{
  const a=scopeOracle(suite.cases[0]);Reflect.deleteProperty(a.items[0],'scope');expect(()=>strict(a)).toThrow();
  const b=scopeOracle(suite.cases[0]);b.items[0].links[0].goalAction='领取返现';expect(()=>strict(b)).toThrow();
  const c=scopeOracle(suite.cases[0]);Reflect.deleteProperty(c.items[0].links[0],'goalAction');expect(()=>strict(c)).toThrow();
});
it('cannot quote a negative goal as positive expansion authorization',()=>{
  const c=suite.cases.find(c=>c.id==='scope_negative_goal')!;const a=scopeOracle(c);
  a.items[1].links=[{goalId:'g1',kind:'required',source:'desc',goalAction:'优惠券'}];
  expect(()=>strict(a,c)).toThrow();
});
it('does not change scope decisions when capacity changes',()=>{
  const c=suite.cases[0],a=scopeOracle(c);
  const result=parseResult(JSON.stringify(a),{...c.input,people:1,workdays:1},true);
  expect(result.wont.map(r=>r.id).sort()).toEqual(['r2','r3']);expect(result.must).toEqual([]);
});
it('does not mistake notifying an existing reward result for granting a new reward',()=>{
  const c=structuredClone(suite.cases.find(c=>c.id==='scope_reward_notification')!);
  c.input.requirements[1].desc='短信通知优惠券领取结果';
  const out=strict(scopeOracle(c),c);
  expect(out.should.map(r=>r.id)).toContain('b');
});
it('does not mistake styling an existing bilingual page for adding languages',()=>{
  const c=structuredClone(suite.cases.find(c=>c.id==='scope_language_required')!);
  c.input.requirements.push({id:'r4',name:'文字样式',desc:'调整中英文页面的字体和间距',estimateDays:1});
  const a=scopeOracle(suite.cases.find(c=>c.id==='scope_language_required')!);
  a.items.push({id:'r4',estimateDays:null,scope:'presentation',links:[{goalId:'g2',kind:'optional',source:'desc',goalAction:'切换中英文'}],dependencies:[]});
  expect(strict(a,c).could.map(r=>r.id)).toContain('r4');
});
it('materializes an indexed goal action without model transcription',()=>{
  const c=suite.cases[0],a=scopeOracle(c);
  for(const row of a.items)for(const link of row.links){Reflect.deleteProperty(link,'goalAction');Object.assign(link,{actionIndex:0});}
  expect(strict(a).goalCoverage[0].evidence[0].goalAction).toBe('访客能报名');
});
it.each([-1,99,0.5,'0'])('rejects invalid goal index %j',actionIndex=>{
  const a=scopeOracle(suite.cases[0]);Reflect.deleteProperty(a.items[0].links[0],'goalAction');Object.assign(a.items[0].links[0],{actionIndex});expect(()=>strict(a)).toThrow();
});
it('does not accept a required action found only in a different requirement',()=>{
  const c=structuredClone(suite.cases[0]);c.input.requirements[1].desc='执行内容校验';
  const a=scopeOracle(c);a.items[1].scope='core';a.items[1].links=[{goalId:'g1',kind:'required',source:'desc',goalAction:'访客能报名'}];
  expect(()=>strict(a,c)).toThrow();
});
it('recovers directly evidenced result helpers when the model omits their links',()=>{
  const c=suite.cases.find(c=>c.id==='scope_helpers_kept')!;const a=scopeOracle(c);
  for(const row of a.items.slice(1,3)){row.scope='extension';row.links=[];}
  const score=evaluateScope(c,strict(a,c));expect(score.semantic,JSON.stringify(score)).toBe(true);
});
it('does not recover a result helper bundled with an additional reward',()=>{
  const c=suite.cases.find(c=>c.id==='scope_bundled_extension')!;const a=scopeOracle(c);a.items[1].scope='operation';
  expect(strict(a,c).wont.map(r=>r.id)).toContain('b');
});
it('rejects a missing feature that the goal expressly says not to do',()=>{
  const c=suite.cases.find(c=>c.id==='scope_negative_goal')!;const a={...scopeOracle(c),goalGaps:[{goalId:'g1',kind:'missing',missingAction:'优惠券'}]};
  expect(()=>strict(a,c)).toThrow();
});
it('requests correction instead of silently dropping a goal-supported expansion',()=>{
  const c=suite.cases.find(c=>c.id==='scope_reward_required')!;const a=scopeOracle(c);a.items[1].links[0].kind='supporting';
  expect(()=>strict(a,c)).toThrow();
});
it('keeps same-object validation as discussion without inventing a prerequisite',()=>{
  const input={people:5,workdays:10,success:'档案员能归档文件',requirements:[{id:'p1',name:'文件校验',desc:'校验文件格式。',estimateDays:1},{id:'p2',name:'文件归档',desc:'归档文件；不依赖文件校验，可独立执行。',estimateDays:1}]};
  const a={items:[{id:'p1',scope:'extension',estimateDays:null,links:[],dependencies:[]},{id:'p2',scope:'core',estimateDays:null,links:[{goalId:'g1',kind:'required',source:'desc',goalAction:'归档文件'}],dependencies:[]}],goalGaps:[]};
  const out=parseResult(JSON.stringify(a),input,true);expect(out.should.map(r=>r.id)).toEqual(['p1']);expect(out.dependencies).toEqual([]);expect(out.must.map(r=>r.id)).toEqual(['p2']);
});
it('recovers literal positive goal capabilities when the model omits every link',()=>{
  const input={people:10,workdays:10,success:'编辑能预览文件；编辑能下载文件',requirements:[{id:'g1',name:'文件预览',desc:'编辑预览文件。',estimateDays:null},{id:'g2',name:'文件下载',desc:'编辑下载文件。',estimateDays:1}]};
  const a={items:input.requirements.map(r=>({id:r.id,scope:'core',estimateDays:r.estimateDays??3,links:[],dependencies:[]})),goalGaps:[]};
  const out=parseResult(JSON.stringify(a),input,true);expect(out.feasibility).toBe('feasible');expect(out.must.map(r=>r.id)).toEqual(['g1','g2']);expect(out.goalCoverage.map(g=>g.requiredIds)).toEqual([['g1'],['g2']]);
});
it('does not infer literal direct coverage from negated or quoted feature mentions',()=>{
  const input={people:5,workdays:10,success:'编辑能下载文件',requirements:[{id:'a',name:'提示','desc':'显示“编辑下载文件”提示文字。',estimateDays:1},{id:'b',name:'范围边界',desc:'本期不支持编辑下载文件。',estimateDays:1}]};
  const a={items:input.requirements.map(r=>({id:r.id,scope:'core',estimateDays:1,links:[],dependencies:[]})),goalGaps:[]};
  expect(parseResult(JSON.stringify(a),input,true).must).toEqual([]);
});
it('uses an explicitly requested language switch even when the model calls it optional',()=>{
  const c=suite.cases.find(c=>c.id==='scope_language_required')!;const a=scopeOracle(c);a.items[2].links[0].kind='optional';
  expect(strict(a,c).must.map(r=>r.id).sort()).toEqual(['r1','r3']);
});
it('applies language equivalence to other language pairs without accepting a different pair',()=>{
  const input={people:5,workdays:10,success:'访客能切换法语和西班牙语',requirements:[{id:'a',name:'版本甲',desc:'页面提供西班牙语和法语切换',estimateDays:1},{id:'b',name:'版本乙',desc:'页面提供中文和英文切换',estimateDays:1}]};
  const a={items:input.requirements.map(r=>({id:r.id,scope:'audience',estimateDays:1,links:[],dependencies:[]})),goalGaps:[]};
  expect(parseResult(JSON.stringify(a),input,true).must.map(r=>r.id)).toEqual(['a']);
});

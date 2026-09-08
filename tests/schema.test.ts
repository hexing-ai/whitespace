import { describe, it, expect } from "vitest";
import { capacityFor, parseResult, validateInput, type PrioritizeInput } from "../src/lib/schema";
import { demoInput } from "../src/lib/demo";
import { modelResult } from "./fixtures";
const parse = (data: unknown, input = demoInput) => parseResult(JSON.stringify(data), input);
describe("input", () => {
  it("accepts positive fractional people and workdays", () => expect(validateInput({ ...demoInput, people: 0.5, workdays: 2.5 }).people).toBe(0.5));
  it.each([0, -1, Infinity, NaN, "5"])("rejects people %s", (people) => expect(() => validateInput({ ...demoInput, people })).toThrow());
  it.each([null, [], {}, { ...demoInput, success: " " }, { ...demoInput, requirements: [] }, { ...demoInput, requirements: [demoInput.requirements[0]] }])("rejects missing input", (v) => expect(() => validateInput(v)).toThrow());
  it.each([0, -1, Infinity, NaN, "2"])("rejects estimate %s", (estimateDays) => expect(() => validateInput({ ...demoInput, requirements: demoInput.requirements.map((r, i) => i ? r : { ...r, estimateDays }) })).toThrow());
  it("rejects duplicate ids, blank names, and nontext descriptions", () => {
    for (const patch of [{ id: "r2" }, { name: " " }, { desc: 123 }]) expect(() => validateInput({ ...demoInput, requirements: demoInput.requirements.map((r, i) => i ? r : { ...r, ...patch }) })).toThrow();
  });
  it("rejects unsafe capacity", () => expect(() => validateInput({ ...demoInput, people: Number.MAX_SAFE_INTEGER, workdays: 20 })).toThrow());
});
describe("capacity and semantic contract", () => {
  it("rounds decimal half up and computes demo capacities", () => { expect(capacityFor(5,10)).toBe(35); expect(capacityFor(5,3)).toBe(10.5); expect(capacityFor(1,3)).toBe(2.1); expect(capacityFor(0.5,1)).toBe(0.4); });
  it("accepts three necessary commitments at both 10 and 3 days",()=>{expect(parse(modelResult()).mustDays).toBe(6);expect(parse(modelResult(),{...demoInput,workdays:3}).must).toHaveLength(3);});
  it("ignores model arithmetic, feasibility, prose, and meeting instructions",()=>{
    const out=parse({...modelResult(),mustDays:0,capacityDays:999,feasibility:'feasible',warnings:['高频刚需'],meetingNote:'已有预审数据'});
    expect(out.capacityDays).toBe(35);expect(out.mustDays).toBe(6);expect(JSON.stringify(out)).not.toContain('高频刚需');expect(out.meetingNote).not.toContain('预审');expect(out.meetingNote.split('\n')).toHaveLength(8);
  });
  it("produces no commitment and an explicitly partial candidate under tight capacity",()=>{
    const out=parse(modelResult(),{...demoInput,people:1,workdays:3});expect(out.must).toEqual([]);expect(out.mustDays).toBe(0);expect(out.feasibility).toBe('infeasible');expect(out.candidates.map(r=>r.id)).toEqual(['r2']);expect(out.candidateDays).toBe(2);expect(out.meetingNote).toContain('不形成本期承诺');
    expect(out.should.find(r=>r.id==='r1')!.reason).toContain('仍需要');expect(out.unmetSuccess.join()).toContain('商家能报名');
  });
  it("requires exact input identity with no unknown, duplicate or missing ids",()=>{
    const unknown=modelResult();unknown.items[0].id='invented';expect(()=>parse(unknown)).toThrow();
    const duplicate=modelResult();duplicate.items[0].id='r2';expect(()=>parse(duplicate)).toThrow();
    const missing=modelResult();missing.items.pop();expect(()=>parse(missing)).toThrow();
  });
  it("keeps input names instead of trusting generated names",()=>{const data=modelResult();Object.assign(data.items[0],{name:'被改名'});expect(parse(data).must[0].name).toBe('商家报名表');});
  it("preserves supplied estimates and estimates blanks",()=>{
    const changed=modelResult();changed.items[0].estimateDays=1;expect(()=>parse(changed)).toThrow();
    const input=structuredClone(demoInput);input.requirements[0].estimateDays=null;expect(parse(modelResult(),input).warnings.join()).toContain('商家报名表');
    const fraction=modelResult();fraction.items[0].estimateDays=1.5;expect(()=>parse(fraction,input)).toThrow();
  });
  it.each([0,-1,null,Infinity,'2'])("rejects missing-input generated estimate %s",estimateDays=>{const input=structuredClone(demoInput);input.requirements[0].estimateDays=null;const data=modelResult();Object.assign(data.items[0],{estimateDays});expect(()=>parse(data,input)).toThrow();});
  it("requires verbatim evidence from the matching requirement",()=>{const data=modelResult();data.items[0].links[0].quote='用户非常喜欢';expect(()=>parse(data)).toThrow(/原文/);});
  it("rejects evidence copied from a different requirement",()=>{const data=modelResult();data.items[0].links[0].quote=demoInput.requirements[1].desc;expect(()=>parse(data)).toThrow(/原文/);});
  it("rejects unknown, duplicate, invalid or empty goal links",()=>{
    for(const patch of [{goalId:'g99'},{kind:'must'},{quote:''}]){const data=modelResult();Object.assign(data.items[0].links[0],patch);expect(()=>parse(data)).toThrow();}
    const data=modelResult();data.items[0].links.push({...data.items[0].links[0]});expect(()=>parse(data)).toThrow();
  });
  it("rejects invalid arrays and malformed JSON",()=>{expect(()=>parse({...modelResult(),items:{}})).toThrow();expect(()=>parseResult('not JSON',demoInput)).toThrow();expect(()=>parseResult('text '+JSON.stringify(modelResult()),demoInput)).toThrow();});
  it("accepts only a complete wrapping JSON fence",()=>{expect(parseResult('```json\n'+JSON.stringify(modelResult())+'\n```',demoInput).mustDays).toBe(6);});
  it("blocks a goal with no required links even when model says feasible",()=>{const data=modelResult();data.items[0].links=[];const out=parse({...data,feasibility:'feasible',unmetSuccess:[]});expect(out.feasibility).toBe('infeasible');expect(out.goalCoverage[0].status).toBe('missing');expect(out.must).toEqual([]);});
  it("respects a partially missing compound goal",()=>{const input={...demoInput,success:'商家能报名并查看报名进度；运营能审核；活动能上线'};const data=modelResult();data.goalGaps=[{goalId:'g1',kind:'missing',missingAction:'查看报名进度'}];const out=parse(data,input);expect(out.goalCoverage[0].requiredIds).toContain('r1');expect(out.goalCoverage[0].status).toBe('missing');expect(out.feasibility).toBe('infeasible');});
  it("checks goal gap ids and kinds",()=>{for(const goalGaps of [[{goalId:'unknown',kind:'missing'}],[{goalId:'g1',kind:'other'}],[{goalId:'g1',kind:'missing'},{goalId:'g1',kind:'missing'}]])expect(()=>parse({...modelResult(),goalGaps})).toThrow();});
  it("blocks unknown prerequisites instead of assuming they exist",()=>{const input=structuredClone(demoInput);input.requirements[0].desc+='；依赖尚未确认的外部授权';const data=modelResult();data.items[0].dependencies=[{toId:null,kind:'uncertain',quote:'依赖尚未确认的外部授权'}];const out=parse(data,input);expect(out.feasibility).toBe('needs_confirmation');expect(out.mustDays).toBe(0);expect(out.candidates.map(r=>r.id)).not.toContain('r1');expect(out.needsConfirmation.join()).toContain('待确认');});
  it("rejects explicit prerequisites without a real input id",()=>{const data=modelResult();data.items[0].dependencies=[{toId:'missing',kind:'explicit',quote:demoInput.requirements[0].desc}];expect(()=>parse(data)).toThrow();});
  it("requires verbatim dependency evidence and no duplicate edges",()=>{const data=modelResult();data.items[2].dependencies[0].quote='虚构依赖';expect(()=>parse(data)).toThrow();const duplicate=modelResult();duplicate.items[2].dependencies.push({...duplicate.items[2].dependencies[0]});expect(()=>parse(duplicate)).toThrow();});
  it("expands transitive prerequisite closure for each goal",()=>{const input=structuredClone(demoInput);input.requirements[1].desc+='；必须在商家报名表完成后执行';const data=modelResult();data.items[1].dependencies=[{toId:'r1',kind:'explicit',quote:'必须在商家报名表完成后执行'}];const out=parse(data,input);expect(out.goalCoverage[2].requiredIds.sort()).toEqual(['r1','r2','r3']);});
  it("blocks cycles and their dependents",()=>{const input=structuredClone(demoInput);input.requirements[1].desc+='；必须在活动上线开关完成后执行';const data=modelResult();data.items[1].dependencies=[{toId:'r3',kind:'explicit',quote:'必须在活动上线开关完成后执行'}];const out=parse(data,input);expect(out.feasibility).toBe('needs_confirmation');expect(out.candidates.map(r=>r.id)).not.toContain('r2');expect(out.candidates.map(r=>r.id)).not.toContain('r3');expect(out.needsConfirmation.join()).toContain('循环');});
  it("does not let unrelated unknown dependencies block valid necessary work",()=>{const input=structuredClone(demoInput);input.requirements[6].desc+='；依赖尚未确认的外部授权';const data=modelResult();data.items[6].dependencies=[{toId:null,kind:'uncertain',quote:'依赖尚未确认的外部授权'}];expect(parse(data,input).feasibility).toBe('feasible');});
  it("keeps unsupported model prose out of all factual fields",()=>{const data=modelResult();Object.assign(data.items[0],{reason:'高频刚需，显著降低满意度'});const out=parse({...data,warnings:['无更低代价']});expect(JSON.stringify([out.must,out.warnings,out.meetingNote])).not.toMatch(/高频|满意度|更低代价/);});
  it("allows empty wont when every input is necessary",()=>{const input={...demoInput,success:'商家能报名；运营能审核',requirements:demoInput.requirements.slice(0,2)};const data=modelResult();data.items=data.items.slice(0,2);expect(parse(data,input).wont).toEqual([]);});
  it("enforces the count limit without relabeling necessary work as unnecessary",()=>{const data=modelResult();data.items[3].links=[{goalId:'g2',kind:'required',quote:demoInput.requirements[3].desc}];const out=parse(data);expect(out.essentialIds).toHaveLength(4);expect(out.must).toEqual([]);expect(out.candidates.length).toBeLessThanOrEqual(3);expect(out.warnings.join()).toContain('4 条必要');});
  it("sums fractional estimates exactly",()=>{const input:PrioritizeInput={people:1,workdays:1,success:'完成甲；完成乙',requirements:[{id:'a',name:'甲',desc:'完成甲',estimateDays:0.3},{id:'b',name:'乙',desc:'完成乙',estimateDays:0.4}]};const data={items:input.requirements.map((r,i)=>({id:r.id,estimateDays:null,links:[{goalId:`g${i+1}`,kind:'required',quote:r.desc}],dependencies:[]})),goalGaps:[]};expect(parse(data,input).mustDays).toBe(0.7);});
  it("retains every original goal segment and eight note lines",()=>{const out=parse(modelResult(),{...demoInput,success:'商家能报名\n运营能审核\n活动能上线'});expect(out.goalCoverage.map(g=>g.text)).toEqual(['商家能报名','运营能审核','活动能上线']);expect(out.meetingNote.split('\n')).toHaveLength(8);});
});

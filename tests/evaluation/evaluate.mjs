const equalSet = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
export function evaluateCase(testCase, output) {
  const expected = testCase.expected;
  if (!output || output.error) return { returned: false, hardInvariants: false, semantic: false, checks: { usable: false } };
  const rows = ['must','should','could','wont'].flatMap(k => output[k] || []);
  const inputIds = testCase.input.requirements.map(r=>r.id);
  const candidates = output.candidates || [];
  const selected = output.feasibility === 'feasible' ? output.must || [] : candidates;
  const required = output.essentialIds || [];
  const pairs = (output.dependencies || []).filter(d=>d.kind==='explicit').map(d=>[d.fromId,d.toId].join('>'));
  const known = new Map(testCase.input.requirements.map(r=>[r.id,r]));
  const expectedCapacity = Math.round((testCase.input.people * testCase.input.workdays * 0.7 + Number.EPSILON) * 10) / 10;
  const near = (a,b) => Math.abs(a-b) < 1e-9;
  const sum = rows => rows.reduce((n,r)=>n+r.estimateDays,0);
  const sourceQuote = (id,quote) => typeof quote==='string' && quote.length>0 && (known.get(id)?.name.includes(quote) || known.get(id)?.desc.includes(quote));
  const hard = {
    arithmetic: near(output.capacityDays,expectedCapacity) && near(output.mustDays,sum(output.must || [])) && near(output.candidateDays ?? 0,sum(candidates)),
    evidence: (output.goalCoverage || []).every(g=>(g.evidence || []).every(e=>sourceQuote(e.requirementId,e.quote))) && (output.dependencies || []).every(d=>sourceQuote(d.fromId,d.quote)),
    coverageStatus: output.feasibility==='feasible' ? (output.goalCoverage || []).every(g=>g.status==='committed') : (output.goalCoverage || []).every(g=>g.status!=='committed'),
    identity: rows.length === inputIds.length && equalSet(rows.map(r=>r.id),inputIds),
    capacity: output.mustDays <= output.capacityDays && (output.must || []).length <= 3 && (output.candidateDays ?? 0) <= output.capacityDays && candidates.length <= 3,
    estimates: rows.every(r=>Number.isFinite(r.estimateDays) && r.estimateDays>0 && (known.get(r.id)?.estimateDays == null ? Number.isInteger(r.estimateDays) : known.get(r.id).estimateDays===r.estimateDays)),
    noFalseCommitment: output.feasibility === 'feasible' || (output.must?.length === 0 && output.mustDays === 0),
    dependencyClosure: (output.dependencies || []).filter(d=>d.kind==='explicit').every(d=>!selected.some(r=>r.id===d.fromId) || selected.some(r=>r.id===d.toId)),
    noUnknownCommitment: !(output.dependencies || []).some(d=>d.kind==='uncertain' && selected.some(r=>r.id===d.fromId)),
    noUnsupportedProse: !/高频刚需|显著降低满意度|已有预审数据|仅r3可|无更低代价/.test(JSON.stringify([rows.map(r=>r.reason),output.warnings,output.meetingNote])),
    briefNote: typeof output.meetingNote==='string' && output.meetingNote.split('\n').length<=8,
  };
  const checks = {
    feasibility: output.feasibility === expected.feasibility,
    essentialIds: equalSet(required,expected.essentialIds),
    goals: output.goalCoverage?.length===expected.goalRequired.length && expected.goalRequired.every((ids,i)=>equalSet(output.goalCoverage[i]?.requiredIds || [],ids)),
    expectedWont: expected.wontIds.every(id=>output.wont?.some(r=>r.id===id)),
    relatedItems: (expected.relatedIds || []).every(id=>[...(output.should || []),...(output.could || [])].some(r=>r.id===id)),
    dependencies: equalSet(pairs,expected.dependencyPairs.map(p=>p.join('>'))),
    candidates: expected.candidateIds == null || equalSet(candidates.map(r=>r.id),expected.candidateIds),
    completeCommitment: output.feasibility !== 'feasible' || equalSet((output.must || []).map(r=>r.id),expected.essentialIds),
  };
  return { returned:true,hardInvariants:Object.values(hard).every(Boolean),semantic:Object.values(checks).every(Boolean),hard,checks };
}

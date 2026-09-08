import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { evaluateCase } from '../tests/evaluation/evaluate.mjs';
import { evaluateDependencies } from '../tests/dependencies/evaluate.mjs';
import { evaluateExclusions } from '../tests/exclusions/evaluate.mjs';
import { evaluateScope } from '../tests/scope/evaluate.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const frozen = await readFile('tests/evaluation/cases.v1.json');
const expectedHash = (await readFile('tests/evaluation/cases.v1.sha256', 'utf8')).trim().split(/\s/)[0];
if (hash(frozen) !== expectedHash) throw new Error('固定用例哈希不符，停止调用。');
const suite = JSON.parse(frozen);
const scope = process.argv.includes('--scope');
const exclusions = process.argv.includes('--exclusions') || scope;
const regression = process.argv.includes('--dependencies') || exclusions;
let dependencyHash;
if (regression) {
  const data=await readFile('tests/dependencies/cases.v1.json');
  dependencyHash=(await readFile('tests/dependencies/cases.v1.sha256','utf8')).trim();
  if(hash(data)!==dependencyHash)throw new Error('依赖用例哈希不符，停止调用。');
  const dependencies=JSON.parse(data);
  suite.models=dependencies.models;suite.repeatCases=dependencies.repeatCases;
  suite.cases.push(...dependencies.cases);
}
let exclusionHash;
if(exclusions){
  const data=await readFile('tests/exclusions/cases.v1.json');
  exclusionHash=(await readFile('tests/exclusions/cases.v1.sha256','utf8')).trim();
  if(hash(data)!==exclusionHash)throw new Error('排除用例哈希不符，停止调用。');
  const extra=JSON.parse(data);suite.cases.push(...extra.cases);suite.repeatCases.push(...extra.repeatCases);
}
let scopeHash;
if(scope){
  const data=await readFile('tests/scope/cases.v1.json');
  scopeHash=(await readFile('tests/scope/cases.v1.sha256','utf8')).trim();
  if(hash(data)!==scopeHash)throw new Error('范围用例哈希不符，停止调用。');
  const extra=JSON.parse(data);suite.cases.push(...extra.cases);suite.repeatCases.push(...extra.repeatCases);
}
const planned = suite.cases.length + suite.repeatCases.length;
if (!process.env.DASHSCOPE_API_KEY?.trim()) { console.log('待验证：未配置百炼 Key。'); process.exit(2); }
const files = ['src/lib/prompt.ts','src/lib/qwen.ts','src/lib/planning.ts','src/lib/input.ts','src/lib/contracts.ts','src/lib/dependency-policy.ts','src/lib/scope-policy.ts','src/app/api/prioritize/route.ts','tests/evaluation/evaluate.mjs','tests/dependencies/evaluate.mjs','tests/exclusions/evaluate.mjs','tests/scope/evaluate.mjs','scripts/compare-models.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(f))])));
const sourceHashes = await hashes();
const runId = new Date().toISOString().replace(/[:.]/g,'-');
const directory = `test-results/${scope ? 'scope' : exclusions ? 'exclusion' : regression ? 'dependency' : 'models'}-${runId}`;
await mkdir(directory, { recursive: true });
const pricing = {
  source: 'https://help.aliyun.com/zh/model-studio/model-pricing', checkedAt:'2026-09-07', region:'华北2（北京）', currency:'CNY', unit:'每百万 Token', mode:'非思考、实时调用、标准原价，不扣免费额度/缓存/活动折扣',
  rates: {'qwen-plus':{input:0.8,output:2,maxInput:128000},'qwen3.6-plus':{input:2,output:12,maxInput:256000},'qwen3.6-flash':{input:1.2,output:7.2,maxInput:256000}},
};
const report = { runId, suiteHash:expectedHash, dependencyHash, exclusionHash, scopeHash, sourceHashes, buildId:(await readFile('.next/BUILD_ID','utf8')).trim(), parameters:{temperature:0.2,enable_thinking:false,max_tokens:6000,timeoutMs:30000,maxAttempts:2}, baseURL:process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1', pricing, actualBill:'未知', models:[] };
const save = async () => { await writeFile(`${directory}/report.tmp`,JSON.stringify(report,null,2)); await rename(`${directory}/report.tmp`,`${directory}/report.json`); };
const percentile = (values,p) => values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1] : null;
const keySemantics = o => o && !o.error ? JSON.stringify({feasibility:o.feasibility,essential:[...o.essentialIds].sort(),goals:o.goalCoverage.map(g=>({id:g.id,required:[...g.requiredIds].sort(),status:g.status})),dependencies:o.dependencies.map(d=>`${d.fromId}>${d.toId}:${d.kind}`).sort(),candidates:o.candidates.map(r=>r.id).sort(),conflicts:o.goalConflicts,groups:['must','should','could','wont'].map(k=>o[k].map(r=>r.id).sort())}) : null;
function summarize(m) {
  const base=m.results.filter(r=>!r.repeat), returned=m.results.filter(r=>r.evaluation.returned);
  const repeats=suite.repeatCases.map(id=>{const a=m.results.find(r=>r.caseId===id&&!r.repeat),b=m.results.find(r=>r.caseId===id&&r.repeat);return {caseId:id,consistent:Boolean(a&&b&&keySemantics(a.output)&&keySemantics(a.output)===keySemantics(b.output))};});
  const attempts=m.logs, usage=attempts.filter(a=>a.tokens), missing=attempts.filter(a=>!a.tokens).length;
  const inputTokens=usage.reduce((n,a)=>n+a.tokens.prompt_tokens,0), outputTokens=usage.reduce((n,a)=>n+a.tokens.completion_tokens,0);
  const rate=pricing.rates[m.model];
  const canPrice=report.baseURL==='https://dashscope.aliyuncs.com/compatible-mode/v1'&&usage.every(a=>a.tokens.prompt_tokens<=rate.maxInput);
  const s={planned,completed:m.results.length,returned:returned.length,baseSemanticPassed:base.filter(r=>r.evaluation.semantic).length,baseTotal:suite.cases.length,hardPassed:returned.filter(r=>r.evaluation.hardInvariants).length,hardTotal:returned.length,firstValid:m.results.filter(r=>r.logs[0]?.outcome==='valid').length,firstValidRate:m.results.filter(r=>r.logs[0]?.outcome==='valid').length/planned,repeats,p50Ms:percentile(m.results.map(r=>r.elapsedMs),0.5),p95Ms:percentile(m.results.map(r=>r.elapsedMs),0.95),attempts:attempts.length,inputTokens,outputTokens,unknownUsageAttempts:missing,standardPriceEstimateCny:canPrice?(inputTokens*rate.input+outputTokens*rate.output)/1000000:null};
  s.passesGate=s.completed===planned&&s.returned===planned&&s.baseSemanticPassed===suite.cases.length&&m.results.filter(r=>r.repeat).every(r=>r.evaluation.semantic)&&s.hardPassed===s.hardTotal&&s.firstValidRate>=0.9&&repeats.every(r=>r.consistent)&&s.p95Ms<=30000;
  return s;
}
for (const [index,model] of suite.models.entries()) {
  if (JSON.stringify(await hashes())!==JSON.stringify(sourceHashes)) throw new Error('比较过程中源文件变化，停止调用。');
  const port=3121+index, m={model,results:[],logs:[],status:'running'}; report.models.push(m);
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,DASHSCOPE_MODEL:model,DASHSCOPE_TEMPERATURE:'0.2',DASHSCOPE_TIMEOUT_MS:'30000',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
  let buffer='';
  server.stdout.on('data',chunk=>{buffer+=chunk.toString();const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){try{const entry=JSON.parse(line);if(entry.event==='qwen_call')m.logs.push(entry);}catch{}}});
  server.stderr.on('data',()=>{});
  try {
    let ready=false;
    for(let i=0;i<60;i++){if(server.exitCode!==null)break;try{if((await fetch(`http://127.0.0.1:${port}`)).ok){ready=true;break;}}catch{}await delay(250);}
    if(!ready)throw new Error('本地比较服务启动失败');
    const plan=[...suite.cases.map(c=>({c,repeat:false})),...suite.repeatCases.map(id=>({c:suite.cases.find(c=>c.id===id),repeat:true}))];
    for(const {c,repeat} of plan){
      const started=Date.now();let output,status,requestId;
      try{const response=await fetch(`http://127.0.0.1:${port}/api/prioritize`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c.input),signal:AbortSignal.timeout(70000)});status=response.status;requestId=response.headers.get('x-request-id');output=await response.json();}
      catch{output={error:{code:'HARNESS_NETWORK',message:'比较请求未完成'}};}
      const elapsedMs=Date.now()-started;await delay(50);
      const result={caseId:c.id,repeat,status,requestId,elapsedMs,logs:m.logs.filter(l=>l.requestId===requestId),evaluation:c.expected.scopeGroups ? evaluateScope(c,output) : c.expected.conflicts ? evaluateExclusions(c,output) : c.expected.typedDependencies ? evaluateDependencies(c,output) : evaluateCase(c,output),output};m.results.push(result);
      m.summary=summarize(m);await save();
      console.log(JSON.stringify({model,caseId:c.id,repeat,hard:result.evaluation.hardInvariants,semantic:result.evaluation.semantic,elapsedMs,error:output.error?.code}));
      if(['AUTH_FAILED','PROVIDER_REJECTED','INVALID_CONFIG'].includes(output.error?.code)){m.status='provider_unavailable';break;}
    }
    if(m.status==='running')m.status='completed';
  }catch{m.status='harness_failed';}
  finally{server.kill('SIGTERM');await delay(200);m.summary=summarize(m);await save();}
  console.log(JSON.stringify({model,summary:m.summary}));
}
report.finishedAt=new Date().toISOString();report.sourcesUnchanged=JSON.stringify(await hashes())===JSON.stringify(sourceHashes);await save();
console.log(`报告：${directory}/report.json`);
if(report.models.some(m=>!m.summary.passesGate))process.exitCode=1;

import { mkdir, writeFile } from 'node:fs/promises';
import { demoInput } from '../src/lib/demo.ts';
const origin='https://whitespace-junz11055-8124.vercel.app';
const report={time:new Date().toISOString(),origin,checks:[],passed:false};
try {
 const home=await fetch(origin,{redirect:'error',signal:AbortSignal.timeout(30000)});
 const title=(await home.text()).match(/<title>([^<]+)<\/title>/)?.[1];
 report.checks.push({name:'public home',passed:home.status===200&&title==='留白 WhiteSpace',status:home.status,title});
 for(let i=0;i<4;i++) {
  const response=await fetch(`${origin}/api/prioritize`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(i===0?demoInput:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json().catch(()=>null);
  report.checks.push({name:i===0?'generation closed':`rate probe ${i}`,status:response.status,code:data?.error?.code,passed:i===0?response.status===503&&data?.error?.code==='DEMO_CLOSED':[400,429].includes(response.status)});
 }
 report.passed=report.checks.every(c=>c.passed)&&report.checks.some(c=>c.status===429);
} catch(e) {report.error=e.message;}
await mkdir('test-results/online-gate',{recursive:true});await writeFile('test-results/online-gate/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;

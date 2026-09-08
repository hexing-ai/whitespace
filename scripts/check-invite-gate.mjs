import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {demoInput} from '../src/lib/demo.ts';
const origin='https://whitespace-junz11055-8124.vercel.app';
if(!process.env.WHITESPACE_SMOKE_INVITE)throw new Error('Missing private invitation; no requests made.');
const post=(path,body,cookie='')=>fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
const report={time:new Date().toISOString(),passed:false,checks:{},platformProbes:[]};
try{
 const old='https://whitespace-kid1p2n0w-junz11055-8124.vercel.app';
 report.checks.oldPostBlocked=(await fetch(old+'/api/prioritize',{method:'POST',headers:{origin:old,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)})).status===403;
 // The IP/path bucket spans hostnames; start the current-site checks in a fresh minute.
 await delay(61000);
 report.checks.home=(await fetch(origin)).status===200;
 const anonymous=await post('/api/prioritize',demoInput);report.checks.anonymousRejected=anonymous.status===401&&(await anonymous.json()).error.code==='INVITE_REQUIRED';
 report.checks.wrongCodeRejected=(await post('/api/invite',{code:'invalid-verification-probe'})).status===401;
 const valid=await post('/api/invite',{code:process.env.WHITESPACE_SMOKE_INVITE});report.checks.validInvitation=valid.status===200;
 const cookie=valid.headers.get('set-cookie')||'';report.checks.secureCookie=/HttpOnly/.test(cookie)&&/Secure/.test(cookie)&&/SameSite=Strict/.test(cookie);
 report.checks.tamperedRejected=(await post('/api/prioritize',demoInput,'__Host-whitespace_invite=invalid-session')).status===401;
 // A fixed window may roll over between verification and the first probe.
 // At most three additional guesses crosses that boundary without reaching the app's sixth-attempt limit.
 for(let i=0;i<3;i++){
  const response=await post('/api/invite',{code:'invalid-verification-probe'});
  const type=response.headers.get('content-type')||'';
  report.platformProbes.push({time:new Date().toISOString(),status:response.status,contentType:type});
  if(response.status===429&&!type.includes('application/json'))break;
 }
 report.checks.platformGuessLimit=report.platformProbes.some(p=>p.status===429&&!p.contentType.includes('application/json'));
 report.checks.oldDeploymentBlocked=(await fetch('https://whitespace-kid1p2n0w-junz11055-8124.vercel.app/api/prioritize',{signal:AbortSignal.timeout(15000)})).status===403;
 report.passed=Object.values(report.checks).every(Boolean);
}finally{await mkdir('test-results/invite-gate',{recursive:true});await writeFile('test-results/invite-gate/report.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;

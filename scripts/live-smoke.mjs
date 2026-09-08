import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { demoInput as demo } from '../src/lib/demo.ts';
import { evaluateCase } from '../tests/evaluation/evaluate.mjs';
import { evaluateExclusions } from '../tests/exclusions/evaluate.mjs';
const negative=process.argv.includes('--negative');
const scope=process.argv.includes('--scope')||negative;
const onlyCase=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
const workspacePreview=process.argv.includes('--workspace-preview');
const remoteURL=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6);
if(remoteURL){const u=new URL(remoteURL);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Remote verification requires an HTTPS origin without credentials or parameters.');}
const baseURL=remoteURL ? new URL(remoteURL).origin : 'http://127.0.0.1:3101';
const exclusions=process.argv.includes('--exclusions')||scope;

if (!remoteURL && !process.env.DASHSCOPE_API_KEY?.trim()) {
  console.log('待验证：未配置 DASHSCOPE_API_KEY，未调用真实百炼。');
  process.exitCode = 2;
} else {
  const port = 3101, logs = [], reports = [];
  const hashFiles=['src/lib/invite.ts','src/app/api/invite/route.ts','src/features/planner/invite-dialog.tsx','src/lib/demo-guard.ts','src/app/api/prioritize/route.ts','src/features/planner/action-arrow.tsx','public/favicon.svg','src/features/home/frame-bank.ts','src/features/home/frame-worker.ts','src/features/home/frame-types.ts','package-lock.json','src/features/home/CinematicHome.tsx','src/features/home/use-video-scroll.ts','src/features/home/config.ts','src/features/home/home.css','src/lib/prompt.ts','src/lib/goals.ts','tests/negative-goals/cases.v1.json','src/lib/planning.ts','src/lib/dependency-policy.ts','src/lib/scope-policy.ts','src/lib/qwen.ts','src/lib/demo.ts','scripts/live-smoke.mjs','tests/evaluation/cases.v1.json','src/lib/contracts.ts','src/lib/input.ts','src/app/page.tsx','src/app/globals.css','src/features/planner/api.ts','src/features/planner/form.ts','src/features/planner/planner.tsx','src/features/planner/plan-results.tsx','src/features/hero-ink/HeroInkBackground.tsx','src/features/hero-ink/fluid.ts','src/features/hero-ink/shaders.ts','src/features/hero-ink/config.ts','tests/exclusions/cases.v1.json','tests/exclusions/evaluate.mjs'];
  const sourceHashes=Object.fromEntries(await Promise.all(hashFiles.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
  const directory = `test-results/live-${negative?'negative':scope?'scope':exclusions?'exclusion':'dependency'}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  await mkdir(directory,{recursive:true});
  const server = remoteURL ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
  let buffer='';
  server?.stdout.on('data',chunk=>{buffer+=chunk.toString();const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){try{const e=JSON.parse(line);if(e.event==='qwen_call')logs.push(e);}catch{}}});
  server?.stderr.on('data',()=>{});
  let browser;
  const save=async()=>writeFile(`${directory}/report.json`,JSON.stringify({time:new Date().toISOString(),target:baseURL,configuredModel:remoteURL?'server-configured':process.env.DASHSCOPE_MODEL||'qwen3.6-plus',actualBill:'未知',sourceHashes,overallPassed:reports.length===(onlyCase?1:negative?11:exclusions?7:4)&&reports.every(r=>Object.values(r.assertions).every(Boolean)),logs,reports},null,2));
  try {
    let ready=false;
    for(let i=0;i<60;i++){if(server&&server.exitCode!==null)break;try{if((await fetch(baseURL)).ok){ready=true;break;}}catch{}await delay(250);}
    if(!ready)throw new Error('本地服务未能启动。');
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
    if (process.env.WHITESPACE_SMOKE_INVITE) {
      const verification = await context.request.post(`${baseURL}/api/invite`, { headers: { origin: baseURL }, data: { code: process.env.WHITESPACE_SMOKE_INVITE } });
      if (!verification.ok()) throw new Error(`Invitation verification failed (${verification.status()}); no model call made.`);
    }
    const page=await context.newPage();
    const browserErrors=[];let apiRequests=0;
    page.on('pageerror',error=>browserErrors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
    page.on('request',request=>{if(request.url().endsWith('/api/prioritize'))apiRequests++;});
    const suite=JSON.parse(await readFile('tests/evaluation/cases.v1.json','utf8'));
    const unknown=structuredClone(suite.cases.find(c=>c.id==='unknown_dependency'));
    unknown.input.requirements.forEach((r,i)=>r.id=`r${i+1}`);
    unknown.expected.essentialIds=['r1'];unknown.expected.goalRequired=[['r1']];unknown.expected.wontIds=['r2'];
    const cases=[...[[5,10],[5,3],[1,3]].map(([people,workdays])=>({id:`demo-${people}-${workdays}`,input:{...demo,people,workdays},expected:{feasibility:people===1?'infeasible':'feasible',essentialIds:['r1','r2','r3'],goalRequired:[['r1'],['r2'],['r2','r3']],wontIds:['r7','r8','r9','r10','r11'],relatedIds:['r4','r5','r6','r12'],dependencyPairs:[['r3','r2']],candidateIds:people===1?['r2']:[]}})),unknown];
    if(exclusions){
      const marked=structuredClone(cases[0]);marked.id='demo-explicit-exclusions';
      marked.input.requirements.forEach(r=>{r.excluded=marked.expected.wontIds.includes(r.id);});
      const extra=JSON.parse(await readFile('tests/exclusions/cases.v1.json','utf8'));
      cases.push(marked,...extra.cases.filter(c=>['exclude_independent','exclude_uncertain'].includes(c.id)));
    }
    if(negative)cases.push(...JSON.parse(await readFile('tests/negative-goals/cases.v1.json','utf8')).cases);
    if(onlyCase&&!cases.some(c=>c.id===onlyCase))throw new Error('未知验证场景。');
    for(const c of cases.filter(c=>!onlyCase||c.id===onlyCase)){
      const errorsBefore=browserErrors.length, requestsBefore=apiRequests;
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(baseURL);
      await page.locator('.home-plan-entry').click();
      if(c.id.startsWith('demo')||c.input.requirements.length>2)await page.getByRole('button',{name:'填入演示数据'}).click();
      await page.getByLabel('成功标准',{exact:true}).fill(c.input.success);
      await page.getByLabel('人数',{exact:true}).fill(String(c.input.people));
      await page.getByLabel('这期工作日',{exact:true}).fill(String(c.input.workdays));
      await page.getByRole('button',{name:'下一步：需求清单'}).click();
      const expand=async i=>{const toggle=page.locator('.requirement-toggle').nth(i-1);if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();};
      const navigate=async label=>{
        if(await page.locator('.mobile-nav').isVisible()&&!await page.locator('.directory').isVisible())await page.getByRole('button',{name:'目录'}).click();
        await page.locator('.directory').getByRole('button',{name:label}).click();
      };
      if(!c.id.startsWith('demo')){
        for(let count=await page.locator('.requirement-toggle').count();count>c.input.requirements.length;count--){await expand(count);await page.getByRole('button',{name:`删除需求 ${count}`,exact:true}).click();}
        for(const [i,r] of c.input.requirements.entries()){
          await expand(i+1);
          await page.getByLabel(`需求 ${i+1} 名称`,{exact:true}).fill(r.name);
          await page.getByLabel(`需求 ${i+1} 说明`,{exact:true}).fill(r.desc);
          await page.getByLabel(`需求 ${i+1} 预估人天`,{exact:true}).fill(r.estimateDays==null?'':String(r.estimateDays));
        }
      }
      for(const [i,r] of c.input.requirements.entries())if(r.excluded){await expand(i+1);await page.getByLabel(`需求 ${i+1} 本期明确不做`,{exact:true}).check();}
      const pending=page.waitForResponse(r=>r.url().endsWith('/api/prioritize'),{timeout:75000});const started=Date.now();
      await page.getByRole('button',{name:'生成这期范围',exact:true}).click();
      const response=await pending,output=await response.json();
      const evaluation=c.expected.conflicts?evaluateExclusions(c,output):evaluateCase(c,output);
      const assertions={http:response.ok(),hard:evaluation.hardInvariants,feasibility:output.feasibility===c.expected.feasibility,essentialIds:JSON.stringify([...(output.essentialIds||[])].sort())===JSON.stringify([...c.expected.essentialIds].sort()),wont:c.expected.wontIds.every(id=>output.wont?.some(r=>r.id===id)),goalCount:output.goalCoverage?.length===c.expected.goalRequired.length};
      assertions.exactSemantic=evaluation.semantic;
      const excluded=c.input.requirements.filter(r=>r.excluded);
      if(excluded.length){
        assertions.exclusion=excluded.every(r=>output.wont?.some(w=>w.id===r.id&&w.reason.includes('你已标记'))&&!output.candidates?.some(w=>w.id===r.id)&&!output.must?.some(w=>w.id===r.id));
        if(!c.expected.conflicts)assertions.noConflict=output.goalConflicts?.length===0;
      }
      if(c.id==='unknown_dependency')assertions.uncertainEdge=output.dependencies?.length===1&&output.dependencies[0].kind==='uncertain'&&output.dependencies[0].fromId==='r1'&&output.dependencies[0].toId===null;
      if(response.ok()){
        try{
          await expect(page.getByRole('region',{name:'这期必须做',exact:true}).locator('article')).toHaveCount(output.must.length);
          if(output.feasibility!=='feasible')await expect(page.getByRole('region',{name:'部分工作候选'})).toContainText('非本期承诺');
          if(output.feasibility==='needs_confirmation')await expect(page.getByText('前置条件待确认，当前不形成承诺')).toBeVisible();
          if(output.goalConflicts.length)await expect(page.getByRole('region',{name:'目标冲突',exact:true})).toContainText(output.goalConflicts[0].message);
          await navigate('原文依据');
          await expect(page.getByRole('region',{name:'成功标准对应'})).toBeVisible();
          await navigate('会议结论');
          await expect(page.getByRole('textbox',{name:'会议结论',exact:true})).toHaveValue(output.meetingNote);
          await page.getByRole('button',{name:'复制结论'}).click();await expect(page.getByText('已复制会议结论',{exact:true})).toBeVisible();
          assertions.copy=await page.evaluate(()=>navigator.clipboard.readText())===output.meetingNote;assertions.visible=true;
          await navigate('范围结果');
          const layouts=[];
          for(const width of [1440,1280,1100,768,390]){
            await page.setViewportSize({width,height:1000});
            const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
            const resources=await page.locator('.remaining').isVisible();
            const singleStage=await page.locator('.stage').count()===1&&await page.locator('.stage').getAttribute('data-view')==='scope';
            layouts.push({width,fits,resources,singleStage});
            if([1440,1100,390].includes(width)){
              await page.screenshot({path:`${directory}/${c.id}-${width}.png`,fullPage:true});
              await page.locator('.capacity-strip').scrollIntoViewIfNeeded();
              await page.screenshot({path:`${directory}/${c.id}-result-${width}.png`});
            }
          }
          assertions.responsive=layouts.every(layout=>layout.fits&&layout.resources&&layout.singleStage);
          assertions.singleRequest=apiRequests-requestsBefore===1;
          assertions.cleanBrowser=browserErrors.length===errorsBefore;
          c.layouts=layouts;
          if(workspacePreview){
            const previews=[];
            for(const width of [1440,1280,1100,768,390,320]){
              await page.setViewportSize({width,height:1000});
              for(const [label,view] of [['规划条件','conditions'],['需求清单','requirements'],['范围结果','scope'],['原文依据','evidence'],['会议结论','note']]){
                await navigate(label);
                if(view==='requirements')await expand(1);
                if(view==='evidence')await page.locator('.coverage-panel details').first().evaluate(el=>{el.open=true;});
                await expect(page.locator('.header-actions').getByRole('button',{name:'产品首页',exact:true})).toBeInViewport();
                await expect(page.locator('.header-actions').getByRole('button',{name:'开始规划',exact:true})).toBeInViewport();
                const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
                previews.push({width,view,fits});
                await page.screenshot({path:`${directory}/workspace-${view}-${width}.png`,fullPage:true});
              }
            }
            const colors=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['--page','--ink','--muted','--accent'].map(k=>[k,s.getPropertyValue(k).trim()]));});
            c.workspacePreviews=previews;c.colors=colors;
            assertions.workspacePreview=previews.every(p=>p.fits)&&colors['--page']==='#f0f3f6'&&colors['--accent']==='#1d3045';
            assertions.cleanBrowser=browserErrors.length===errorsBefore;
          }
          if(excluded.length){
            const i=c.input.requirements.findIndex(r=>r.excluded);
            await navigate('需求清单');await expand(i+1);
            await page.getByLabel(`需求 ${i+1} 本期明确不做`,{exact:true}).uncheck();
            await navigate('范围结果');await expect(page.getByText('当前内容待生成')).toBeVisible();
            await expect(page.getByRole('textbox',{name:'会议结论',exact:true})).toHaveCount(0);assertions.clearsOnChange=true;
          }
        }catch(error){assertions.visible=false;c.uiError=String(error.message);}
      }
      reports.push({caseId:c.id,uiError:c.uiError,elapsedMs:Date.now()-started,requestId:response.headers()['x-request-id'],assertions,evaluation,output,layouts:c.layouts,workspacePreviews:c.workspacePreviews,colors:c.colors,browserErrors:browserErrors.slice(errorsBefore)});
      await delay(50);await save();console.log(JSON.stringify({caseId:c.id,assertions,elapsedMs:Date.now()-started}));
    }
    if(reports.some(r=>Object.values(r.assertions).some(v=>!v)))process.exitCode=1;
  }catch{console.error('真实浏览器验证未完成，已保存已完成记录。');process.exitCode=1;}
  finally{if(browser)await browser.close();server?.kill('SIGTERM');await save();console.log(`报告：${directory}/report.json`);}
}

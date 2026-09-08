import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.argv.find(s=>s.startsWith('--url='))?.slice(6)||'http://127.0.0.1:3100';
const output='test-results/home-progressive';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
const report={time:new Date().toISOString(),target:base,passed:false,scenarios:[]};
const p95=values=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*.95))]||0;
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 for(const scenario of ['cold','warm','constrained']){
  const page=await context.newPage();const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if(scenario!=='warm')await cdp.send('Network.clearBrowserCache');
  if(scenario!=='constrained')await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:1250000,uploadThroughput:625000});
  if(scenario==='constrained'){
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:100000});
  }
  await page.addInitScript(()=>{
   const probe=window.homeProbe={paints:[],rafs:0,active:false,longTasks:[]};const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){draw.apply(this,args);if(probe.active&&args[0] instanceof ImageBitmap)probe.paints.push(performance.now());};
   const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf(t=>{probe.rafs++;cb(t);});
   new PerformanceObserver(list=>{if(probe.active)probe.longTasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask'});
  });
  const errors=[],requests=[];let workers=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('worker',()=>workers++);page.on('request',r=>requests.push(r.url()));
  const started=Date.now();await page.goto(base,{waitUntil:'domcontentloaded'});const home=page.locator('.cinematic-home');
  if(scenario==='constrained'){
   await expect(home).toHaveAttribute('data-video-state','unavailable',{timeout:6000});
   await expect(home).toHaveAttribute('data-mode','static');
   const navigationToReadableMs=Date.now()-started;
   await page.getByRole('button',{name:'向下了解'}).click();await page.getByRole('button',{name:'了解如何开始'}).click();
   await page.screenshot({path:`${output}/${scenario}.png`,fullPage:false});
   const animationRequests=requests.filter(u=>/\.mp4|\/media\/frames\//.test(u));
   const network=await page.evaluate(()=>({effectiveType:navigator.connection?.effectiveType,downlink:navigator.connection?.downlink,saveData:navigator.connection?.saveData}));
   await page.getByRole('button',{name:'用示例体验'}).click();await expect(page.getByLabel('人数',{exact:true})).toHaveValue('5');
   report.scenarios.push({scenario,mode:'static',navigationToReadableMs,network,animationRequests:animationRequests.length,errors,passed:animationRequests.length<=8&&errors.length===0&&navigationToReadableMs<10000});
   await page.close();continue;
  }
  await expect(home).toHaveAttribute('data-renderer','canvas',{timeout:8000});
  const navigationToFrameMs=Date.now()-started;
  await page.waitForTimeout(scenario==='constrained'?3000:600);
  const initial=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/media/frames/')).map(e=>({bytes:e.encodedBodySize,transfer:e.transferSize})));
  const item={scenario,navigationToFrameMs,firstFrameMs:Number(await home.getAttribute('data-first-frame-ms')),initialFrames:initial.length,initialBodyBytes:initial.reduce((s,e)=>s+e.bytes,0),initialTransferBytes:initial.reduce((s,e)=>s+e.transfer,0),paths:[],errors,workers};report.scenarios.push(item);
  for(const [name,from,to,duration] of [['slow',0,1,5000],['fast',0,1,900],['reverse',1,0,3000]]){
   await home.evaluate((el,p)=>scrollTo(0,(el.clientHeight-innerHeight)*p),from);await page.waitForTimeout(800);
   const metrics=await page.evaluate(async({from,to,duration})=>{
    const probe=window.homeProbe;probe.paints=[];probe.longTasks=[];probe.active=true;
    const span=document.querySelector('.cinematic-home').clientHeight-innerHeight,start=performance.now();
    await new Promise(resolve=>{function tick(now){const p=Math.min(1,(now-start)/duration);scrollTo(0,span*(from+(to-from)*p));if(p<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
    probe.active=false;return {paints:probe.paints,longTasks:probe.longTasks};
   },{from,to,duration});
   item.paths.push({name,paintedFrames:metrics.paints.length,paintGapP95Ms:p95(metrics.paints.slice(1).map((v,i)=>v-metrics.paints[i])),longTaskMaxMs:Math.max(0,...metrics.longTasks)});
  }
  await page.waitForTimeout(1600);
  const before=await page.evaluate(()=>window.homeProbe.rafs);await page.waitForTimeout(500);item.idleRafs=await page.evaluate(()=>window.homeProbe.rafs)-before;
  await home.evaluate(el=>scrollTo(0,(el.clientHeight-innerHeight)*.45));await page.waitForTimeout(1000);
  await page.screenshot({path:`${output}/${scenario}.png`,fullPage:false});
  item.noVideo= !requests.some(u=>u.includes('.mp4'));item.maxBitmaps=Number(await page.locator('.home-canvas').getAttribute('data-bitmaps'));
  item.passed=errors.length===0&&workers===0&&item.noVideo&&item.initialFrames<=17&&item.initialBodyBytes<400000&&item.firstFrameMs<5000&&navigationToFrameMs<(scenario==='constrained'?10000:3000)&&item.idleRafs===0&&item.maxBitmaps<=24&&(scenario==='constrained'||item.paths.every(p=>p.paintedFrames>10&&p.paintGapP95Ms<=100));
  await page.locator('.home-plan-entry').click();await expect(page.getByLabel('成功标准',{exact:true})).toBeVisible();
  await page.close();
 }
 await context.close();report.passed=report.scenarios.every(s=>s.passed);
}finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;

import { chromium, expect } from '@playwright/test';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
const files=await readdir('.next/static/chunks',{recursive:true});
const inkChunks=[],fluidChunks=[];
for(const file of files.filter(x=>x.endsWith('.js'))){const source=await readFile(`.next/static/chunks/${file}`,'utf8');if(source.includes('Float textures unavailable'))fluidChunks.push(file);if(source.includes('Float textures unavailable')||source.includes('pointerenter')&&source.includes('hero-ink-background'))inkChunks.push(file);}
if(!inkChunks.length)throw new Error('Could not locate ink chunks');
const directory='test-results/ink-production';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const results=[];
try{
 for(const mode of ['desktop','skip','reduced','touch']){
  const context=await browser.newContext(mode==='touch'?{hasTouch:true,isMobile:true,viewport:{width:390,height:844}}:{viewport:{width:1440,height:1000},reducedMotion:mode==='reduced'?'reduce':'no-preference'});
  if(mode==='skip')await context.addInitScript(()=>localStorage.setItem('whitespace:skip-intro:v1','true'));
  const page=await context.newPage(),errors=[];let businessRequests=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(request.url().endsWith('/api/prioritize'))businessRequests++;});
  await page.addInitScript(()=>{
   window.inkFrames=[];const draw=WebGL2RenderingContext.prototype.drawArrays;
   WebGL2RenderingContext.prototype.drawArrays=function(...args){draw.apply(this,args);if(this.getParameter(this.FRAMEBUFFER_BINDING)===null)window.inkFrames.push(performance.now());};
  });
  await page.goto('http://127.0.0.1:3100');
  const checks={};
  if(mode==='skip'){
   await expect(page.getByLabel('成功标准',{exact:true})).toBeVisible();await expect(page.locator('.hero-ink-background')).toHaveCount(0);
  }else{
   await expect(page.locator('.hero-ink-background')).toHaveAttribute('data-ink-state',mode==='desktop'?'rest':'static');
   if(mode==='desktop'){
    const rect=await page.locator('.hero-ink-background').boundingBox();
    await page.mouse.move(rect.x+80,rect.y+100);await page.waitForTimeout(100);
    checks.firstEntryBlank=await page.evaluate(()=>window.inkFrames.length===0);
    checks.motion=[];
    for(const motion of ['normal','fast','turns']){
      await page.mouse.move(rect.x+80,rect.y+160);await page.waitForTimeout(40);
      const frameStart=await page.evaluate(()=>window.inkFrames.length);
      for(let i=0;i<60;i++){
        const x=motion==='normal'?80+i*5:motion==='fast'?80+(i%18)*30:rect.width/2+Math.sin(i/6)*200;
        const y=motion==='turns'?220+Math.sin(i/3)*95:160+Math.sin(i/7)*30;
        await page.mouse.move(rect.x+x,rect.y+y);await page.waitForTimeout(16);
      }
      const times=await page.evaluate(start=>window.inkFrames.slice(start),frameStart);
      const gaps=times.slice(1).map((t,i)=>t-times[i]).sort((a,b)=>a-b);
      checks.motion.push({motion,frames:times.length,averageFps:(times.length-1)*1000/(times.at(-1)-times[0]),p95GapMs:gaps[Math.ceil(gaps.length*.95)-1]});
      await page.screenshot({path:`${directory}/desktop-${motion}.png`,fullPage:true});
      await page.mouse.move(0,0);await expect(page.locator('.hero-ink-background')).toHaveAttribute('data-ink-state','rest',{timeout:12000});
    }
    checks.glError=await page.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2').getError());
    await page.mouse.move(0,0);
    await expect(page.locator('.hero-ink-background')).toHaveAttribute('data-ink-state','rest',{timeout:12000});
    const frames=await page.evaluate(()=>window.inkFrames);await page.waitForTimeout(250);
    checks.restStops=await page.evaluate(count=>window.inkFrames.length===count,frames.length);
    checks.renderedFrames=frames.length;checks.averageActiveFps=frames.length>1?(frames.length-1)*1000/(frames.at(-1)-frames[0]):0;
    checks.renderer=await page.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
   }
   await page.screenshot({path:`${directory}/${mode}-rest.png`,fullPage:mode!=='touch'});
  }
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>x.name));
  const loadedInk=inkChunks.filter(file=>resources.some(url=>url.endsWith(file)));
  checks.loadedInkChunks=loadedInk;
  checks.noFluidForStatic=mode==='desktop'||!loadedInk.some(file=>fluidChunks.includes(file));
  checks.noBusinessRequests=businessRequests===0;checks.cleanConsole=errors.length===0;
  results.push({mode,checks,errors});
  await context.close();
 }
 const passed=results.every(r=>r.checks.noBusinessRequests&&r.checks.cleanConsole&&r.checks.noFluidForStatic&&(r.mode!=='desktop'||r.checks.firstEntryBlank&&r.checks.restStops&&r.checks.glError===0&&r.checks.renderedFrames>10))&&results.find(r=>r.mode==='skip').checks.loadedInkChunks.length===0;
 const report={time:new Date().toISOString(),passed,inkChunks,fluidChunks,results};await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!passed)process.exitCode=1;
}finally{await browser.close();}

import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({reducedMotion:"reduce"});
const errors=[],responses=[],layouts=[]; let businessRequests=0;
page.on('request',request=>{if(request.url().endsWith('/api/prioritize'))businessRequests++;});
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('response',response=>{if(response.status()>=400)responses.push({url:response.url(),status:response.status()});});
await mkdir('test-results/frontend-preview',{recursive:true});
const navigate=async label=>{
 if(await page.locator('.mobile-nav').isVisible()&&!await page.locator('.directory').isVisible())await page.getByRole('button',{name:'目录'}).click();
 await page.locator('.directory').getByRole('button',{name:label}).click();
};
try{
 for(const width of [1440,1280,1100,768,390]){
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:3100');
  await expect(page.locator('.cinematic-home')).toBeVisible();
  await page.screenshot({path:`test-results/frontend-preview/welcome-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'用示例体验'}).click();
  for(const label of ['规划条件','需求清单','范围结果','原文依据','会议结论']){
   await navigate(label);
   await expect(page.locator('.stage')).toHaveCount(1);
   await expect(page.locator('#stage-title')).toBeFocused();
   const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
   layouts.push({width,label,fits});
   if(label==='需求清单'){
    await page.locator('.requirement-toggle').first().click();
    const check=page.getByLabel('需求 1 本期明确不做',{exact:true});
    await check.focus();await page.keyboard.press('Space');await expect(check).toBeChecked();
   }
   await page.screenshot({path:`test-results/frontend-preview/${label}-${width}.png`,fullPage:true});
  }
 }
 await page.getByRole('button',{name:'使用说明'}).click();
 await page.getByRole('dialog').getByLabel('下次直接进入工作台').check();
 await page.keyboard.press('Escape');
 for(let i=0;i<3;i++){await page.reload();await expect(page.getByLabel('成功标准',{exact:true})).toHaveValue('');}
 const storage=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
 await page.getByRole('button',{name:'使用说明'}).click();
 await page.getByRole('dialog').getByLabel('下次直接进入工作台').uncheck();
 await page.keyboard.press('Escape');await page.reload();await expect(page.locator('.cinematic-home')).toBeVisible();
 const contrast=await page.evaluate(()=>{
  const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll('button')].filter(el=>el.getBoundingClientRect().height>0).map(el=>{
   const style=getComputedStyle(el);const a=lum(style.color),b=lum(style.backgroundColor);
   return {label:el.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),height:el.getBoundingClientRect().height};
  });
 });
 const passed=!businessRequests&&!errors.length&&!responses.length&&layouts.every(x=>x.fits)&&contrast.every(x=>x.ratio>=4.5&&x.height>=44)&&Object.keys(storage).length===1;
 const report={time:new Date().toISOString(),passed,errors,responses,layouts,contrast,storage,businessRequests};
 await writeFile('test-results/frontend-preview/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 if(!passed)process.exitCode=1;
}finally{await browser.close();}

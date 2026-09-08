import { chromium, expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const directory='../design/screenshots';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();
const errors=[],checks=[];let apiCalls=0;
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('request',request=>{if(request.url().includes('/api/'))apiCalls++;});
try{
 await page.goto('http://127.0.0.1:3102');
 for(const width of [1440,1100,768,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  for(const scene of ['welcome','conditions','requirements','result','conflict','waiting']){
   await page.locator(`.views [data-view="${scene}"]`).click();
   const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
   const mobile=width<=900;
   let focusedStage=true;
   if(scene!=='welcome'&&mobile){focusedStage=scene==='conditions'?await page.locator('#conditions').isVisible()&&!await page.locator('#requirements').isVisible():scene==='requirements'?await page.locator('#requirements').isVisible()&&!await page.locator('#conditions').isVisible():await page.locator('#result').isVisible()&&!await page.locator('.editor').isVisible();}
   checks.push({width,scene,fits,focusedStage});
   if([1440,1100,390].includes(width))await page.screenshot({path:`${directory}/${scene}-${width}.png`,fullPage:true});
  }
 }
 await page.locator('.mobile-steps [data-view="requirements"]').click();
 await expect(page.locator('.req')).toHaveCount(12);
 await page.locator('.req summary').nth(1).click();
 await expect(page.locator('.req').nth(1)).toHaveAttribute('open','');
 await page.getByRole('button',{name:'使用说明',exact:true}).click();
 await expect(page.locator('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).not.toBeVisible();
 const report={date:new Date().toISOString(),purpose:'仅视觉稿布局检查，不作为真实业务验收',checks,errors,apiCalls,passed:checks.every(c=>c.fits&&c.focusedStage)&&errors.length===0&&apiCalls===0};
 await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(!report.passed)process.exitCode=1;
}finally{await browser.close();}

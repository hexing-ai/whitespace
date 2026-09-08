// Build-time media processing only. Visitors never run the video decoder.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { originalVideoSha256 } from './original-video-fixture.mjs';
const source=process.argv[2];
if(!source)throw new Error('Usage: npm run prepare:home -- /path/to/authorized-original.mp4');
const bytes=await readFile(source);const sourceHash=createHash('sha256').update(bytes).digest('hex');
if(sourceHash!==originalVideoSha256)throw new Error('Source differs from the approved timeline; update source verification explicitly before replacing media.');
const result=await build({entryPoints:['scripts/media/frame-worker.ts'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome120'});
const server=createServer((req,res)=>{if(req.url==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].contents);}else if(req.url==='/video.mp4'){res.setHeader('Content-Type','video/mp4');res.end(bytes);}else {res.setHeader('Content-Type','text/html');res.end('<title>WhiteSpace media preparation</title>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const frames=[];let metadata;
 await page.exposeFunction('saveFrame',async(data)=>{const buffer=Buffer.from(data.bytes,'base64');frames.push({ts:data.ts,buffer,hash:createHash('sha256').update(buffer).digest('hex')});});
 metadata=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const worker=new Worker('/worker.js');const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Media preparation timed out'));},120000);
  worker.onerror=()=>{clearTimeout(timeout);worker.terminate();reject(new Error('Media worker failed'));};
  worker.onmessage=async({data})=>{
   if(data.type==='error'){clearTimeout(timeout);worker.terminate();reject(new Error(data.reason));}
   if(data.type!=='ready')return;
   try {
    for(const frame of data.frames){const bytes=new Uint8Array(await frame.blob.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);await window.saveFrame({ts:frame.ts,bytes:btoa(binary)});}
    const {frames,...meta}=data;clearTimeout(timeout);worker.terminate();resolve({...meta,count:frames.length});
   }catch(e){clearTimeout(timeout);worker.terminate();reject(e);}
  };
  worker.postMessage({type:'build',url:location.origin+'/video.mp4'});
 }));
 frames.sort((a,b)=>a.ts-b.ts);
 const version=createHash('sha256').update(frames.map(f=>f.hash).join('')).digest('hex').slice(0,16);
 const dir=`public/media/frames/${version}`;await mkdir(dir,{recursive:true});
 const entries=[];
 for(const [i,f] of frames.entries()){const name=String(i).padStart(3,'0')+'.webp';await writeFile(`${dir}/${name}`,f.buffer);entries.push({ts:f.ts,url:`/media/frames/${version}/${name}`,bytes:f.buffer.length,sha256:f.hash});}
 const manifest={version,sourceHash,width:metadata.width,height:metadata.height,duration:metadata.duration,frames:entries};
 await writeFile('src/features/home/frames-manifest.json',JSON.stringify(manifest)+'\n');
 console.log(JSON.stringify({version,frames:frames.length,width:manifest.width,height:manifest.height,totalBytes:frames.reduce((s,f)=>s+f.buffer.length,0)}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

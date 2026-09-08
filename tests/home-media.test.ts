import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import manifest from '../src/features/home/frames-manifest.json';
it('ships the complete approved timeline with immutable verified frames and a bounded payload',()=>{
 expect(manifest.sourceHash).toBe('b702ba81cde6756eb2a885d3e2d647784fa2909d42961c912c14985b35d27e73');
 expect(manifest.frames).toHaveLength(241);expect([manifest.width,manifest.height]).toEqual([1280,720]);
 expect(manifest.frames[0].ts).toBe(0);expect(manifest.frames.at(-1)!.ts).toBe(10000000);
 let total=0;
 for(const [i,frame] of manifest.frames.entries()){
  expect(frame.url).toMatch(/^\/media\/frames\/[a-f0-9]{16}\/\d{3}\.webp$/);
  const bytes=readFileSync('public'+frame.url);total+=bytes.length;
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(frame.sha256);
  if(i)expect(frame.ts).toBeGreaterThan(manifest.frames[i-1].ts);
 }
 expect(total).toBeLessThan(4500000);
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { nearestFrame } from "../src/features/home/frame-types";
import { FrameBank } from "../src/features/home/frame-bank";

afterEach(() => vi.unstubAllGlobals());

describe("timestamp selection", () => {
  it("finds the closest available frame, including irregular timestamps and endpoints", () => {
    const frames = [0, 40000, 120000, 160000].map(ts => ({ ts }));
    expect(nearestFrame(frames, -100)).toBe(0);
    expect(nearestFrame(frames, 73000)).toBe(1);
    expect(nearestFrame(frames, 100000)).toBe(2);
    expect(nearestFrame(frames, 999999)).toBe(3);
    expect(nearestFrame([], 0)).toBe(-1);
  });
});

function setup() {
  const pending: ((bitmap: ImageBitmap) => void)[] = [];
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise<ImageBitmap>(resolve => pending.push(resolve))));
  const drawImage = vi.fn();
  const canvas = { width: 1920, height: 1080, dataset: {}, getContext: () => ({ drawImage }) } as unknown as HTMLCanvasElement;
  const fail = vi.fn(), wake = vi.fn();
  const bank = new FrameBank(canvas, Array.from({ length: 240 }, (_, i) => ({ ts: i * 40000, blob: new Blob() })), wake, fail);
  return { bank, pending, canvas, drawImage, fail, wake };
}

it("bounds outstanding bitmap creation during rapid random scrolling and closes late results after exit", async () => {
  const { bank, pending, drawImage, canvas, wake } = setup();
  for (let i = 0; i < 200; i++) bank.draw((i % 100) / 10);
  expect(pending).toHaveLength(4);
  bank.dispose();
  const close = vi.fn();
  pending.forEach(resolve => resolve({ close } as unknown as ImageBitmap));
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(4));
  expect(wake).not.toHaveBeenCalled();
  expect(drawImage).not.toHaveBeenCalled();
  expect(canvas.width * canvas.height).toBe(1);
});

it("evicts old bitmaps, retains no more than 24 and closes every allocation on disposal", async () => {
  const { bank, pending, canvas } = setup();
  let allocated = 0, closed = 0;
  for (let i = 0; i < 120; i += 4) {
    bank.draw(i * .04);
    pending.splice(0).forEach(resolve => { allocated++; resolve({ close: () => { closed++; } } as unknown as ImageBitmap); });
    await new Promise(resolve => setTimeout(resolve, 0));
    bank.draw(i * .04);
    expect(Number(canvas.dataset.bitmaps)).toBeLessThanOrEqual(24);
    expect(allocated - closed).toBeLessThanOrEqual(24);
  }
  bank.dispose();
  pending.splice(0).forEach(resolve => { allocated++; resolve({ close: () => { closed++; } } as unknown as ImageBitmap); });
  await vi.waitFor(() => expect(closed).toBe(allocated));
});

it("reports bitmap decoding failure so the caller can restore the readable static page", async () => {
  const { bank, fail } = setup();
  vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("decode failure")));
  bank.draw(0);
  await vi.waitFor(() => expect(fail).toHaveBeenCalled());
  bank.dispose();
});

it("keeps moving with available frames while a fast-changing exact target is still decoding", async () => {
  const { bank, pending, canvas } = setup();
  bank.draw(0);
  pending.splice(0).forEach(resolve => resolve({ close: vi.fn() } as unknown as ImageBitmap));
  await new Promise(resolve => setTimeout(resolve, 0));
  bank.draw(0);
  bank.draw(.4);
  expect(Number(canvas.dataset.time)).toBeGreaterThan(0);
  expect(Number(canvas.dataset.time)).toBeLessThanOrEqual(.4);
  bank.dispose();
  pending.splice(0).forEach(resolve => resolve({ close: vi.fn() } as unknown as ImageBitmap));
});

it('does not download the full asset set, aborts outstanding requests when hidden or disposed',async()=>{
 const signals:AbortSignal[]=[];
 vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>{signals.push(init.signal);init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));} )));
 const canvas={width:1280,height:720,dataset:{},getContext:()=>({drawImage:vi.fn()})} as unknown as HTMLCanvasElement;
 const wake=vi.fn(),fail=vi.fn();const bank=new FrameBank(canvas,Array.from({length:241},(_,i)=>({ts:i*40000,url:`/media/frames/example/${i}.webp`})),wake,fail);
 bank.draw(0);expect(signals).toHaveLength(4);bank.pause(true);expect(signals.every(s=>s.aborted)).toBe(true);
 await new Promise(r=>setTimeout(r,0));expect(fail).not.toHaveBeenCalled();expect(wake).not.toHaveBeenCalled();
 bank.pause(false);bank.draw(0);expect(signals).toHaveLength(8);bank.dispose();expect(signals.every(s=>s.aborted)).toBe(true);
});

it('abandons downloads behind a fast scroll and requests the new target next', async () => {
 const requested: {url:string;signal:AbortSignal}[]=[];
 vi.stubGlobal('fetch',vi.fn((url,init)=>new Promise((_resolve,reject)=>{
  requested.push({url,signal:init.signal});init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));
 })));
 const canvas={width:1280,height:720,dataset:{},getContext:()=>({drawImage:vi.fn()})} as unknown as HTMLCanvasElement;
 const bank=new FrameBank(canvas,Array.from({length:241},(_,i)=>({ts:i*40000,url:`/media/frames/test/${i}.webp`})),vi.fn(),vi.fn());
 bank.draw(0);bank.draw(8);
 expect(requested.slice(0,4).every(r=>r.signal.aborted)).toBe(true);
 await new Promise(r=>setTimeout(r,0));bank.draw(8);
 expect(requested[4].url).toBe('/media/frames/test/200.webp');bank.dispose();
});

it('uses the small whole-timeline preview immediately while detail is delayed, then releases it', async () => {
 const closePreview=vi.fn(),closeDetail=vi.fn(),drawImage=vi.fn();
 const preview={close:closePreview} as unknown as ImageBitmap, detail={close:closeDetail} as unknown as ImageBitmap;
 const decodes:((value:ImageBitmap)=>void)[]=[];
 vi.stubGlobal('createImageBitmap',vi.fn(()=>new Promise<ImageBitmap>(resolve=>decodes.push(resolve))));
 const fetched:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{fetched.push(url);return {ok:true,blob:async()=>new Blob()};}));
 const canvas={width:1280,height:720,dataset:{},getContext:()=>({drawImage})} as unknown as HTMLCanvasElement;
 const bank=new FrameBank(canvas,Array.from({length:241},(_,i)=>({ts:i*40000,url:`/frame/${i}`})),vi.fn(),vi.fn(),{url:'/preview',width:320,height:180,columns:11,step:2,count:121});
 await vi.waitFor(()=>expect(decodes).toHaveLength(1));decodes.shift()!(preview);
 await vi.waitFor(()=>expect(canvas.dataset.preview).toBe('ready'));
 bank.draw(8,false);expect(fetched).toEqual(['/preview']);expect(canvas.dataset.frame).toBe('200');expect(canvas.dataset.quality).toBe('preview');
 bank.draw(8,true);await vi.waitFor(()=>expect(decodes).toHaveLength(1));decodes.shift()!(detail);
 await new Promise(resolve=>setTimeout(resolve,0));bank.draw(8,true);expect(canvas.dataset.quality).toBe('full');
 bank.dispose();expect(closePreview).toHaveBeenCalledOnce();expect(closeDetail).toHaveBeenCalledOnce();
});

import { homeConfig } from './config';
import { nearestFrame, type CompressedFrame } from './frame-types';
type AssetFrame = { ts: number; url: string };
type Entry = { bitmap: ImageBitmap | null; controller: AbortController };
export class FrameBank {
  private cache = new Map<number, Entry>();
  private pending = 0;
  private slowLoads = 0;
  private disposed = false;
  private paused = false;
  private painted = -1;
  private previousTarget = 0;
  private direction = 1;
  private context: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement, private frames: (CompressedFrame | AssetFrame)[], private wake: () => void, private fail: () => void) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Missing canvas context');
    this.context = context;
  }
  draw(seconds: number): number | null {
    const index = nearestFrame(this.frames, seconds * 1e6);
    if (this.disposed || this.paused || index < 0) return null;
    if (index !== this.previousTarget) this.direction = index > this.previousTarget ? 1 : -1;
    this.previousTarget = index;
    this.request(index);
    let drawable = index;
    if (!this.cache.get(index)?.bitmap) {
      let distance = Infinity;
      for (const [candidate, entry] of this.cache) {
        const nextDistance = Math.abs(this.frames[candidate].ts - seconds * 1e6);
        const followsDirection = this.painted < 0 || (index >= this.painted ? candidate >= this.painted && candidate <= index : candidate <= this.painted && candidate >= index);
        if (entry.bitmap && followsDirection && nextDistance < distance) { drawable = candidate; distance = nextDistance; }
      }
    }
    const bitmap = this.cache.get(drawable)?.bitmap;
    if (bitmap && drawable !== this.painted) {
      this.context.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
      this.painted = drawable;
      this.canvas.dataset.frame = String(drawable);
      this.canvas.dataset.time = String(this.frames[drawable].ts / 1e6);
    }
    // Prioritize the exact target, then nearby frames in the current direction.
    for (let offset = 1; offset <= 8; offset++) {
      this.request(index + offset * this.direction);
      if (offset <= 3) this.request(index - offset * this.direction);
    }
    this.canvas.dataset.bitmaps = String(this.cache.size);
    return this.painted < 0 ? null : this.frames[this.painted].ts / 1e6;
  }
  private request(index: number) {
    if (index < 0 || index >= this.frames.length || this.disposed || this.paused) return;
    const existing = this.cache.get(index);
    if (existing) { this.cache.delete(index); this.cache.set(index, existing); return; }
    if (this.pending >= homeConfig.bitmapConcurrency) return;
    while (this.cache.size >= homeConfig.bitmapLimit) {
      const oldest = [...this.cache].find(([, entry]) => entry.bitmap)?.[0];
      if (oldest === undefined) return;
      this.cache.get(oldest)?.bitmap?.close(); this.cache.delete(oldest);
    }
    const entry: Entry = { bitmap: null, controller: new AbortController() };
    this.cache.set(index, entry); this.pending++;
    const source = this.frames[index];
    const started = performance.now();
    const load = 'blob' in source ? createImageBitmap(source.blob) : fetch(source.url, { signal: AbortSignal.any([entry.controller.signal, AbortSignal.timeout(4000)]), cache: 'force-cache' }).then(response => {
      if (!response.ok) throw new Error('Frame unavailable');
      return response.blob();
    }).then(blob => {
      // Base weak-network fallback on actual small-frame downloads, not noisy bandwidth estimates.
      this.slowLoads = performance.now() - started >= 700 ? this.slowLoads + 1 : 0;
      if (this.slowLoads >= 2) { this.fail(); throw new Error('Frame downloads are too slow for smooth scrolling'); }
      return createImageBitmap(blob);
    });
    load.then(bitmap => {
      if (this.disposed || this.cache.get(index) !== entry) bitmap.close();
      else entry.bitmap = bitmap;
    }).catch(() => {
      if (this.cache.get(index) === entry) this.cache.delete(index);
      if (!this.disposed && !entry.controller.signal.aborted) this.fail();
    }).finally(() => { this.pending--; if (!this.disposed && !this.paused) this.wake(); });
  }
  pause(value: boolean) {
    this.paused = value;
    if (value) for (const [index, entry] of this.cache) if (!entry.bitmap) { entry.controller.abort(); this.cache.delete(index); }
  }
  dispose() {
    this.disposed = true;
    this.cache.forEach(entry => { entry.controller.abort(); entry.bitmap?.close(); }); this.cache.clear();
    this.frames = [];
    this.canvas.width = 1; this.canvas.height = 1;
  }
}

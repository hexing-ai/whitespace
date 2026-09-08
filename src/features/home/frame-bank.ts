import { homeConfig } from "./config";
import { nearestFrame, type CompressedFrame } from "./frame-types";

type Entry = { bitmap: ImageBitmap | null };

export class FrameBank {
  private cache = new Map<number, Entry>();
  private pending = 0;
  private disposed = false;
  private painted = -1;
  private context: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, private frames: CompressedFrame[], private wake: () => void, private fail: () => void) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Missing canvas context");
    this.context = context;
  }

  draw(seconds: number): number | null {
    const index = nearestFrame(this.frames, seconds * 1e6);
    if (this.disposed || index < 0) return null;
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
    for (const neighbor of [index + 1, index - 1, index + 2]) this.request(neighbor);
    this.canvas.dataset.bitmaps = String(this.cache.size);
    return this.painted < 0 ? null : this.frames[this.painted].ts / 1e6;
  }

  private request(index: number) {
    if (index < 0 || index >= this.frames.length || this.disposed) return;
    const existing = this.cache.get(index);
    if (existing) { this.cache.delete(index); this.cache.set(index, existing); return; }
    if (this.pending >= homeConfig.bitmapConcurrency) return;
    while (this.cache.size >= homeConfig.bitmapLimit) {
      const oldest = [...this.cache].find(([, entry]) => entry.bitmap)?.[0];
      if (oldest === undefined) return;
      this.cache.get(oldest)?.bitmap?.close(); this.cache.delete(oldest);
    }
    const entry: Entry = { bitmap: null };
    this.cache.set(index, entry); this.pending++;
    createImageBitmap(this.frames[index].blob).then(bitmap => {
      if (this.disposed || this.cache.get(index) !== entry) bitmap.close();
      else entry.bitmap = bitmap;
    }).catch(() => { if (!this.disposed) this.fail(); }).finally(() => { this.pending--; if (!this.disposed) this.wake(); });
  }

  dispose() {
    this.disposed = true;
    this.cache.forEach(entry => entry.bitmap?.close()); this.cache.clear();
    this.frames = [];
    this.canvas.width = 1; this.canvas.height = 1;
  }
}

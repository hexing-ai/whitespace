import { homeConfig } from './config';
import { nearestFrame, type CompressedFrame } from './frame-types';
type AssetFrame = { ts: number; url: string };
type Preview = { url: string; width: number; height: number; columns: number; step: number; count: number };
type Entry = { bitmap: ImageBitmap | null; controller: AbortController };
export class FrameBank {
  private cache = new Map<number, Entry>();
  private pending = 0;
  private preview: ImageBitmap | null = null;
  private previewController: AbortController | null = null;
  private previewFailed = false;
  private unavailable = new Set<number>();
  private paintedSource = '';
  private disposed = false;
  private paused = false;
  private painted = -1;
  private previousTarget = 0;
  private direction = 1;
  private context: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement, private frames: (CompressedFrame | AssetFrame)[], private wake: () => void, private fail: () => void, private previewSource?: Preview) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Missing canvas context');
    this.context = context;
    this.loadPreview();
  }
  draw(seconds: number, detail = true): number | null {
    const index = nearestFrame(this.frames, seconds * 1e6);
    if (this.disposed || this.paused || index < 0) return null;
    if (index !== this.previousTarget) this.direction = index > this.previousTarget ? 1 : -1;
    this.previousTarget = index;
    // A fast scroll must prioritize its new position instead of finishing stale downloads.
    for (const [candidate, entry] of this.cache) {
      if (!entry.bitmap && Math.abs(candidate - index) > 12) {
        entry.controller.abort(); this.cache.delete(candidate);
      }
    }
    if (detail || !this.preview) this.request(index);
    let drawable = index;
    if (!this.cache.get(index)?.bitmap && !this.preview) {
      let distance = Infinity;
      for (const [candidate, entry] of this.cache) {
        const nextDistance = Math.abs(this.frames[candidate].ts - seconds * 1e6);
        const followsDirection = this.painted < 0 || (index >= this.painted ? candidate >= this.painted && candidate <= index : candidate <= this.painted && candidate >= index);
        if (entry.bitmap && followsDirection && nextDistance < distance) { drawable = candidate; distance = nextDistance; }
      }
    }
    const bitmap = this.cache.get(drawable)?.bitmap;
    let source = `full-${drawable}`;
    if (bitmap) {
      if (source !== this.paintedSource) this.context.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
    } else if (this.preview && this.previewSource) {
      const previewIndex = Math.min(this.previewSource.count - 1, Math.round(index / this.previewSource.step));
      drawable = previewIndex * this.previewSource.step; source = `preview-${drawable}`;
      if (source !== this.paintedSource) this.context.drawImage(this.preview,
        previewIndex % this.previewSource.columns * this.previewSource.width,
        Math.floor(previewIndex / this.previewSource.columns) * this.previewSource.height,
        this.previewSource.width, this.previewSource.height, 0, 0, this.canvas.width, this.canvas.height);
    }
    if (bitmap || this.preview) {
      this.painted = drawable; this.paintedSource = source;
      this.canvas.dataset.frame = String(drawable);
      this.canvas.dataset.time = String(this.frames[drawable].ts / 1e6);
      this.canvas.dataset.quality = bitmap ? 'full' : 'preview';
    }
    // Without a whole-timeline preview, keep the bounded neighbour fallback.
    if (!this.previewSource) for (let offset = 1; offset <= 8; offset++) {
      this.request(index + offset * this.direction);
      if (offset <= 3) this.request(index - offset * this.direction);
    }
    this.canvas.dataset.bitmaps = String(this.cache.size + (this.preview ? 1 : 0));
    return this.painted < 0 ? null : this.frames[this.painted].ts / 1e6;
  }
  private loadPreview() {
    if (!this.previewSource || this.preview || this.previewController || this.previewFailed || this.paused || this.disposed) return;
    const controller = new AbortController(); this.previewController = controller;
    this.canvas.dataset.preview = 'loading';
    fetch(this.previewSource.url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]), cache: 'force-cache' })
      .then(response => { if (!response.ok) throw new Error('Preview unavailable'); return response.blob(); })
      .then(blob => createImageBitmap(blob))
      .then(bitmap => {
        if (this.disposed || controller.signal.aborted) bitmap.close();
        else { this.preview = bitmap; this.canvas.dataset.preview = 'ready'; }
      }).catch(() => {
        if (!this.disposed && !controller.signal.aborted) {
          this.previewFailed = true; this.canvas.dataset.preview = 'unavailable';
          if (this.unavailable.size && this.painted < 0) this.fail();
        }
      }).finally(() => {
        if (this.previewController === controller) this.previewController = null;
        if (!this.disposed && !this.paused) { this.loadPreview(); this.wake(); }
      });
  }
  private request(index: number) {
    if (index < 0 || index >= this.frames.length || this.unavailable.has(index) || this.disposed || this.paused) return;
    const existing = this.cache.get(index);
    if (existing) { this.cache.delete(index); this.cache.set(index, existing); return; }
    if (this.pending + (this.previewController ? 1 : 0) >= homeConfig.bitmapConcurrency) return;
    while (this.cache.size >= (this.previewSource ? 12 : homeConfig.bitmapLimit)) {
      const oldest = [...this.cache].find(([, entry]) => entry.bitmap)?.[0];
      if (oldest === undefined) return;
      this.cache.get(oldest)?.bitmap?.close(); this.cache.delete(oldest);
    }
    const entry: Entry = { bitmap: null, controller: new AbortController() };
    this.cache.set(index, entry); this.pending++;
    const source = this.frames[index];
    const load = 'blob' in source ? createImageBitmap(source.blob) : fetch(source.url, { signal: AbortSignal.any([entry.controller.signal, AbortSignal.timeout(4000)]), cache: 'force-cache' }).then(response => {
      if (!response.ok) throw new Error('Frame unavailable');
      return response.blob();
    }).then(blob => createImageBitmap(blob));
    load.then(bitmap => {
      if (this.disposed || this.cache.get(index) !== entry) bitmap.close();
      else entry.bitmap = bitmap;
    }).catch(() => {
      if (this.cache.get(index) === entry) this.cache.delete(index);
      if (!this.disposed && !entry.controller.signal.aborted) {
        this.unavailable.add(index);
        if (!this.previewSource || (this.previewFailed && !this.preview)) this.fail();
      }
    }).finally(() => { this.pending--; if (!this.disposed && !this.paused) this.wake(); });
  }
  pause(value: boolean) {
    this.paused = value;
    if (value) this.previewController?.abort(); else this.loadPreview();
    if (value) for (const [index, entry] of this.cache) if (!entry.bitmap) { entry.controller.abort(); this.cache.delete(index); }
  }
  dispose() {
    this.disposed = true;
    this.previewController?.abort(); this.preview?.close(); this.preview = null;
    this.cache.forEach(entry => { entry.controller.abort(); entry.bitmap?.close(); }); this.cache.clear();
    this.frames = [];
    this.canvas.width = 1; this.canvas.height = 1;
  }
}

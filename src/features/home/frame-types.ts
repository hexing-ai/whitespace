export type CompressedFrame = { ts: number; blob: Blob };
export type FrameBankMessage =
  | { type: "ready"; frames: CompressedFrame[]; duration: number; width: number; height: number; acceleration: string; buildMs: number; downloadMs: number; decodeMs: number; compressedBytes: number; peakFrames: number }
  | { type: "retry"; reason: string }
  | { type: "error"; reason: string };
export type FrameWorkerCommand = { type: "build"; url: string } | { type: "pause"; value: boolean };

export function nearestFrame(frames: { ts: number }[], timestamp: number) {
  if (!frames.length) return -1;
  let low = 0, high = frames.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].ts < timestamp) low = middle + 1; else high = middle;
  }
  if (low > 0 && timestamp - frames[low - 1].ts <= frames[low].ts - timestamp) return low - 1;
  return low;
}

import { heroInkConfig as config } from "./config";

export type InkPoint = { x: number; y: number; time: number };
export type InkSample = { x: number; y: number; dx: number; dy: number; amount: number };

export function sampleStroke(points: readonly InkPoint[], aspect: number, dt: number): InkSample[] {
  if (points.length < 2 || aspect <= 0) return [];
  const scaleX = Math.max(1, aspect), scaleY = Math.max(1, 1 / aspect);
  const lengths = points.slice(1).map((point, i) => Math.hypot((point.x - points[i].x) * scaleX, (point.y - points[i].y) * scaleY));
  const distance = lengths.reduce((sum, length) => sum + length, 0);
  if (distance < 0.0001) return [];
  const count = Math.min(config.maxStrokeSamples, Math.max(1, Math.ceil(distance / (config.radius * config.strokeSpacing))));
  const duration = Math.max(1 / 240, (points.at(-1)!.time - points[0].time) / 1000);
  const speed = distance / duration;
  const fast = Math.min(1, Math.max(0, (speed - config.fastSpeedStart) / (config.fastSpeedFull - config.fastSpeedStart)));
  const uvLength = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0);
  // Match the existing dye rate across refresh rates; the per-frame cap stays fixed.
  const normalAmount = config.dyeAmount * Math.min(1, Math.max(0, dt) * config.dyeReferenceFps);
  const amount = (normalAmount + (config.fastDyeAmount - normalAmount) * fast) * Math.min(1, uvLength / 0.004);
  const force = Math.min(uvLength, config.maxPointerDelta) * config.force;
  const budget = Math.min(force, config.maxForce);
  const samples: InkSample[] = [];
  let segment = 0, walked = 0;
  for (let i = 1; i <= count; i++) {
    const location = distance * i / count;
    while (segment < lengths.length - 1 && walked + lengths[segment] < location) { walked += lengths[segment]; segment++; }
    const from = points[segment], to = points[segment + 1];
    const t = lengths[segment] ? Math.min(1, (location - walked) / lengths[segment]) : 1;
    const dx = to.x - from.x, dy = to.y - from.y, magnitude = Math.hypot(dx, dy) || 1;
    samples.push({ x: from.x + dx * t, y: from.y + dy * t, dx: dx / magnitude * budget / count, dy: dy / magnitude * budget / count, amount: amount / count });
  }
  return samples;
}

export function nextFrameDeadline(now: number, previousDeadline: number, fps: number) {
  const interval = 1000 / fps;
  const next = previousDeadline ? previousDeadline + interval : now + interval;
  return next > now ? next : now + interval;
}

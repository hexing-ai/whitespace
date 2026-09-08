export const heroInkConfig = {
  color: [64 / 255, 91 / 255, 80 / 255] as const,
  opacity: 0.26,
  dyeAmount: 0.32,
  fastDyeAmount: 0.48,
  dyeReferenceFps: 30,
  maxStrokeSamples: 6,
  maxPendingPoints: 64,
  strokeSpacing: 0.75,
  fastSpeedStart: 0.6, // Container short edges per second.
  fastSpeedFull: 2.4,
  radius: 0.026, // Fraction of the container's shorter edge.
  force: 2400,
  maxForce: 90,
  maxPointerDelta: 0.035,
  curl: 16,
  dyeDissipation: 1.35, // Exponential decay per second.
  velocityDissipation: 2.2,
  pressureIterations: 12,
  simulationResolution: 96,
  dyeResolution: 384,
  maxDevicePixelRatio: 1.5,
  maxCanvasEdge: 1440,
  maxFps: 60,
  restThreshold: 0.002,
} as const;
export type InkConfig = typeof heroInkConfig;

export function boundedImpulse(dx: number, dy: number, config: InkConfig = heroInkConfig) {
  const length = Math.hypot(dx, dy);
  const scale = length ? Math.min(length, config.maxPointerDelta) / length : 0;
  const x = dx * scale * config.force, y = dy * scale * config.force;
  const limit = Math.min(1, config.maxForce / (Math.hypot(x, y) || 1));
  return { x: x * limit, y: y * limit };
}

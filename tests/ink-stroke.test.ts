import { expect, it } from "vitest";
import { sampleStroke, nextFrameDeadline } from "../src/features/hero-ink/stroke";

it("first coordinate and stationary input inject nothing", () => {
  expect(sampleStroke([{ x: 0.5, y: 0.5, time: 0 }], 1, 1 / 60)).toEqual([]);
  expect(sampleStroke([{ x: 0.5, y: 0.5, time: 0 }, { x: 0.5, y: 0.5, time: 16 }], 1, 1 / 60)).toEqual([]);
});
it("fast strokes fill intermediate positions and reach the current pointer", () => {
  const samples = sampleStroke([{ x: 0.1, y: 0.4, time: 0 }, { x: 0.6, y: 0.4, time: 16 }], 1, 1 / 60);
  expect(samples).toHaveLength(6);
  expect(samples[0].x).toBeGreaterThan(0.1); expect(samples[0].x).toBeLessThan(0.3);
  expect(samples.at(-1)?.x).toBeCloseTo(0.6);
  expect(samples.every(s => s.y === 0.4)).toBe(true);
});
it("turns follow the sampled path rather than crossing the corner", () => {
  const samples = sampleStroke([{ x: 0.1, y: 0.1, time: 0 }, { x: 0.4, y: 0.1, time: 8 }, { x: 0.4, y: 0.4, time: 16 }], 1, 1 / 60);
  expect(samples.some(s => s.x < 0.4)).toBe(true); expect(samples.some(s => s.y > 0.1)).toBe(true);
  expect(samples.every(s => Math.abs(s.x - 0.4) < 1e-8 || Math.abs(s.y - 0.1) < 1e-8)).toBe(true);
});
it("sampling shares the approved dye and force budgets even on an extreme reversal", () => {
  const samples = sampleStroke([{ x: 0, y: 0, time: 0 }, { x: 1, y: 1, time: 1 }, { x: 0, y: 0, time: 2 }], 2, 0.05);
  expect(samples.length).toBeLessThanOrEqual(6);
  expect(samples.reduce((n, s) => n + s.amount, 0)).toBeLessThanOrEqual(0.48 + 1e-9);
  expect(samples.reduce((n, s) => n + Math.hypot(s.dx, s.dy), 0)).toBeLessThanOrEqual(90);
});
it("normal movement preserves its dye rate when refresh rate doubles", () => {
  const stroke = (ms: number) => sampleStroke([{ x: 0.1, y: 0.2, time: 0 }, { x: 0.1 + ms * 0.0003, y: 0.2, time: ms }], 1, ms / 1000).reduce((n, s) => n + s.amount, 0);
  expect(2 * stroke(1000 / 60)).toBeCloseTo(stroke(1000 / 30));
});
it("deadline scheduling does not drop every other 60Hz frame due to timestamp rounding", () => {
  let deadline = 0, draws = 0;
  for (let i = 0; i < 120; i++) {
    const now = Math.round(i * 1000 / 60 * 10) / 10;
    if (now + 0.5 >= deadline) { draws++; deadline = nextFrameDeadline(now, deadline, 60); }
  }
  expect(draws).toBe(120);
});
it("144Hz displays keep the 60fps budget without a catch-up burst after suspension", () => {
  let deadline = 0, draws = 0;
  for (let i = 0; i < 144; i++) { const now = i * 1000 / 144; if (now + 0.5 >= deadline) { draws++; deadline = nextFrameDeadline(now, deadline, 60); } }
  expect(draws).toBeGreaterThanOrEqual(59); expect(draws).toBeLessThanOrEqual(61);
  expect(nextFrameDeadline(10000, deadline, 60)).toBeGreaterThan(10000);
});

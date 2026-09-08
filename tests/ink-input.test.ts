import { expect, it } from "vitest";
import { boundedImpulse, heroInkConfig } from "../src/features/hero-ink/config";

it("zero movement creates no impulse", () => { expect(boundedImpulse(0, 0)).toEqual({ x: 0, y: 0 }); });
it("small movement retains direction and scales smoothly", () => {
  const a = boundedImpulse(0.001, -0.002), b = boundedImpulse(0.002, -0.004);
  expect(b.x).toBeCloseTo(2 * a.x); expect(b.y).toBeCloseTo(2 * a.y);
});
it("arbitrarily fast movement is capped in magnitude, not per axis", () => {
  for (const [x, y] of [[1, 1], [10000, -10000], [-0.2, 0.1], [0, 10]]) {
    const impulse = boundedImpulse(x, y);
    expect(Math.hypot(impulse.x, impulse.y)).toBeLessThanOrEqual(heroInkConfig.maxForce);
    expect(Math.sign(impulse.x)).toBe(Math.sign(x)); expect(Math.sign(impulse.y)).toBe(Math.sign(y));
  }
});

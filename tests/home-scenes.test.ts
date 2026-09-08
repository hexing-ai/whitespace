import { describe, expect, it } from "vitest";
import { sceneOpacities } from "../src/features/home/config";

describe("home story", () => {
  it("shows one scene at each reading stop", () => {
    expect(sceneOpacities(0)).toEqual([1, 0, 0]);
    expect(sceneOpacities(.45)).toEqual([0, 1, 0]);
    expect(sceneOpacities(.9)).toEqual([0, 0, 1]);
  });
  it("never overlaps scenes while scrolling in either direction", () => {
    for (let i = -10; i <= 110; i++) {
      const values = sceneOpacities(i / 100);
      expect(values.filter(value => value > 0).length).toBeLessThanOrEqual(1);
      expect(values.every(value => value >= 0 && value <= 1)).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { BASE_PROFILES } from "@avs/genre";
import {
  baseYawFor,
  circularMeanDeg,
  normalizeDeg,
  pickMotion,
  round1,
  stageYaw,
  STAGE_SPACING_DEG,
} from "./camera";
import { createRng } from "./random";

describe("angles", () => {
  it("normalizes angles into 0-360", () => {
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(360)).toBe(0);
  });

  it("averages angles around the circle", () => {
    expect(circularMeanDeg([350, 10])).toBeCloseTo(0, 5);
    expect(circularMeanDeg([90, 90])).toBeCloseTo(90, 5);
    expect(circularMeanDeg([])).toBe(0);
  });

  it("rounds to one decimal", () => {
    expect(round1(12.345)).toBe(12.3);
    expect(round1(-0.04)).toBe(-0);
  });
});

describe("stage positions", () => {
  it("are stable for a place and 45 degrees apart per rank", () => {
    expect(baseYawFor("village")).toBe(baseYawFor("village"));
    const first = stageYaw("village", 0);
    const second = stageYaw("village", 1);

    expect(first).toBe(baseYawFor("village"));
    expect(normalizeDeg(second - first)).toBe(STAGE_SPACING_DEG);
  });

  it("differs between places", () => {
    expect(baseYawFor("village")).not.toBe(baseYawFor("river"));
  });
});

describe("pickMotion", () => {
  const profile = BASE_PROFILES.cinematic;

  it("keeps very short shots still", () => {
    expect(pickMotion(profile, "wide", 1500, createRng("a"))).toBe("static");
  });

  it("is deterministic and avoids moves that do not suit the shot", () => {
    expect(pickMotion(profile, "wide", 6000, createRng("x"))).toBe(pickMotion(profile, "wide", 6000, createRng("x")));

    const rng = createRng("extreme");
    for (let i = 0; i < 200; i += 1) {
      const motion = pickMotion(profile, "extreme_close_up", 5000, rng);
      expect(["slow_pan", "pull_out", "parallax", "orbit"]).not.toContain(motion);
    }
  });
});

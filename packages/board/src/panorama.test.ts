import { describe, expect, it } from "vitest";
import {
  assessPanorama,
  blendSeam,
  checkPanoramaDimensions,
  fitSize,
  measureSeam,
} from "./panorama";
import type { RgbaImage } from "./panorama";

const RELAXED = { minWidth: 8, recommendedWidth: 8 };

function makeImage(width: number, height: number, pixel: (x: number, y: number) => number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Wraps around perfectly: the last column continues into the first. */
const seamless = () => makeImage(64, 32, (x) => Math.round(128 + 100 * Math.sin((2 * Math.PI * x) / 64)));
/** Jumps from white to black at the join. */
const ramp = () => makeImage(64, 32, (x) => Math.floor((x / 63) * 255));
const flat = () => makeImage(64, 32, () => 90);

describe("checkPanoramaDimensions", () => {
  it("accepts a large 2:1 image", () => {
    expect(checkPanoramaDimensions(2048, 1024)).toEqual([]);
  });

  it("warns about low resolution", () => {
    expect(checkPanoramaDimensions(2000, 1000)).toEqual([{ code: "low_resolution", severity: "warning" }]);
  });

  it("rejects wrong proportions and tiny images", () => {
    expect(checkPanoramaDimensions(4096, 1024)).toEqual([{ code: "bad_aspect", severity: "error" }]);
    expect(checkPanoramaDimensions(512, 256)).toEqual([{ code: "too_small", severity: "error" }]);

    const both = checkPanoramaDimensions(1000, 1000).map((issue) => issue.code);
    expect(both).toEqual(["bad_aspect", "too_small"]);
  });

  it("allows a small deviation from 2:1 and rejects a zero height", () => {
    expect(checkPanoramaDimensions(2048, 1020)).toEqual([]);
    expect(checkPanoramaDimensions(2048, 0).map((issue) => issue.code)).toContain("bad_aspect");
  });
});

describe("fitSize", () => {
  it("scales down and keeps the aspect ratio", () => {
    expect(fitSize(8192, 4096, 4096, 2048)).toEqual({ width: 4096, height: 2048 });
    expect(fitSize(6000, 3000, 4096, 2048)).toEqual({ width: 4096, height: 2048 });
  });

  it("never upscales", () => {
    expect(fitSize(2048, 1024, 4096, 2048)).toEqual({ width: 2048, height: 1024 });
  });
});

describe("measureSeam", () => {
  it("sees no seam in a wrapping image or a flat image", () => {
    expect(measureSeam(seamless()).score).toBeLessThan(1);
    expect(measureSeam(flat()).score).toBe(0);
  });

  it("sees a clear seam where the edges do not match", () => {
    expect(measureSeam(ramp()).score).toBeGreaterThan(1);
  });

  it("handles images that are too narrow to measure", () => {
    expect(measureSeam(makeImage(2, 2, () => 0)).score).toBe(0);
  });
});

describe("blendSeam", () => {
  it("removes a visible seam without changing size or the original", () => {
    const original = ramp();
    const before = Array.from(original.data);
    const fixed = blendSeam(original);

    expect(fixed.width).toBe(64);
    expect(fixed.height).toBe(32);
    expect(measureSeam(original).score).toBeGreaterThan(1);
    expect(measureSeam(fixed).score).toBeLessThanOrEqual(1);
    expect(Array.from(original.data)).toEqual(before);
  });

  it("leaves the alpha channel and the middle of the image untouched", () => {
    const original = ramp();
    const fixed = blendSeam(original);

    expect(fixed.data[3]).toBe(255);
    const middle = (10 * 64 + 32) * 4;
    expect(fixed.data[middle]).toBe(original.data[middle]);
  });
});

describe("assessPanorama", () => {
  it("passes a wrapping image", () => {
    expect(assessPanorama(seamless(), RELAXED)).toMatchObject({ ok: true, issues: [] });
  });

  it("reports a visible seam as an error", () => {
    const report = assessPanorama(ramp(), RELAXED);
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual({ code: "seam_visible", severity: "error" });
    expect(report.seamScore).toBeGreaterThan(1);
  });

  it("does not block on warnings", () => {
    const report = assessPanorama(flat(), { minWidth: 8, recommendedWidth: 4096 });
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([{ code: "low_resolution", severity: "warning" }]);
  });

  it("reports the image size", () => {
    expect(assessPanorama(flat(), RELAXED)).toMatchObject({ width: 64, height: 32 });
  });
});

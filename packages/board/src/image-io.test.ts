import { describe, expect, it } from "vitest";
import { preparePanorama } from "./image-io";
import type { DecodeOptions, ImageCodec } from "./image-io";
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

function fakeCodec(image: RgbaImage): { codec: ImageCodec; decodeCalls: DecodeOptions[] } {
  const decodeCalls: DecodeOptions[] = [];
  const codec: ImageCodec = {
    decode: async (_blob, options) => {
      decodeCalls.push(options);
      return image;
    },
    encode: async (_image, mime) => new Blob(["fixed"], { type: mime }),
  };
  return { codec, decodeCalls };
}

const original = () => new Blob(["original"], { type: "image/png" });
const seamless = () => makeImage(64, 32, (x) => Math.round(128 + 100 * Math.sin((2 * Math.PI * x) / 64)));
const ramp = () => makeImage(64, 32, (x) => Math.floor((x / 63) * 255));

describe("preparePanorama", () => {
  it("keeps the original file when the panorama is fine", async () => {
    const { codec } = fakeCodec(seamless());
    const blob = original();

    const result = await preparePanorama(blob, codec, RELAXED);

    expect(result.blob).toBe(blob);
    expect(result.fixedSeam).toBe(false);
    expect(result.report.ok).toBe(true);
  });

  it("limits the decoded size to 4096 x 2048 by default", async () => {
    const { codec, decodeCalls } = fakeCodec(seamless());
    await preparePanorama(original(), codec, RELAXED);
    expect(decodeCalls).toEqual([{ maxWidth: 4096, maxHeight: 2048 }]);

    await preparePanorama(original(), codec, { ...RELAXED, maxWidth: 1000, maxHeight: 500 });
    expect(decodeCalls[1]).toEqual({ maxWidth: 1000, maxHeight: 500 });
  });

  it("repairs a visible seam and returns the repaired file", async () => {
    const { codec } = fakeCodec(ramp());
    const blob = original();

    const result = await preparePanorama(blob, codec, RELAXED);

    expect(result.fixedSeam).toBe(true);
    expect(result.blob).not.toBe(blob);
    expect(result.blob.type).toBe("image/jpeg");
    expect(await result.blob.text()).toBe("fixed");
    expect(result.report.ok).toBe(true);
  });

  it("reports the seam without repairing it when auto-fix is off", async () => {
    const { codec } = fakeCodec(ramp());
    const blob = original();

    const result = await preparePanorama(blob, codec, { ...RELAXED, autoFixSeam: false });

    expect(result.blob).toBe(blob);
    expect(result.fixedSeam).toBe(false);
    expect(result.report.ok).toBe(false);
  });

  it("does not try to repair wrong proportions", async () => {
    const { codec } = fakeCodec(makeImage(40, 40, () => 100));
    const result = await preparePanorama(original(), codec, RELAXED);

    expect(result.fixedSeam).toBe(false);
    expect(result.report.ok).toBe(false);
    expect(result.report.issues.map((issue) => issue.code)).toContain("bad_aspect");
  });

  it("uses the requested output format for the repaired file", async () => {
    const { codec } = fakeCodec(ramp());
    const result = await preparePanorama(original(), codec, { ...RELAXED, outputMime: "image/png" });
    expect(result.blob.type).toBe("image/png");
  });
});

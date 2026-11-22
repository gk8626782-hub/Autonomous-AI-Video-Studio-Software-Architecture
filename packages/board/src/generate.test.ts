import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { MockAdapter } from "@avs/providers";
import type { AdapterContext } from "@avs/providers";
import { MediaService, MemoryFileStore, StudioDatabase } from "@avs/storage";
import { extensionForMime, generateCharacterSet, generateCharacterView, generatePanorama, toBlob } from "./generate";
import type { ImageCodec } from "./image-io";
import type { RgbaImage } from "./panorama";

const instant = async (): Promise<void> => undefined;
const context: AdapterContext = { apiKey: "k", resolveMedia: async () => new Blob() };
const RELAXED = { minWidth: 8, recommendedWidth: 8 };
const character = { name: "Asha", species: "human", ageGroup: "child", gender: "female", appearance: "red scarf" };

let db: StudioDatabase;
let media: MediaService;
let adapter: MockAdapter;
let counter: number;

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

const codecFor = (image: RgbaImage): ImageCodec => ({
  decode: async () => image,
  encode: async (_image, mime) => new Blob(["fixed"], { type: mime }),
});

beforeEach(() => {
  db = new StudioDatabase(`avs-board-gen-${Math.random().toString(36).slice(2)}`);
  counter = 0;
  media = new MediaService(db, new MemoryFileStore(), { now: () => 1, newId: () => `m${++counter}` });
  adapter = new MockAdapter({ pollsBeforeDone: 0 });
});

afterEach(async () => {
  await db.delete();
});

const base = () => ({ adapter, context, media, projectId: "p1", styleHint: "cartoon", sleep: instant });

describe("helpers", () => {
  it("maps image types to file extensions", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/JPEG")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(() => extensionForMime("image/gif")).toThrowError(/Unsupported image type/);
  });

  it("reads a stream into a blob", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hel"));
        controller.enqueue(new TextEncoder().encode("lo"));
        controller.close();
      },
    });
    const blob = await toBlob(stream, "text/plain");
    expect(await blob.text()).toBe("hello");
    expect(blob.type).toBe("text/plain");
  });
});

describe("generateCharacterView", () => {
  it("generates one view and stores it as an AI image", async () => {
    const record = await generateCharacterView({ ...base(), character, view: "front" });

    expect(record).toMatchObject({
      id: "m1",
      projectId: "p1",
      kind: "image",
      origin: "ai",
      mime: "image/png",
      status: "ok",
      width: 1024,
      height: 1536,
    });
    expect(record.opfsPath).toBe("projects/p1/media/m1.png");
    expect(adapter.submitted[0]).toMatchObject({ capability: "image" });
    expect((adapter.submitted[0] as { prompt: string }).prompt).toContain("front view");
    expect((adapter.submitted[0] as { prompt: string }).prompt).toContain("Asha");
  });

  it("rejects a provider that returns something other than an image", async () => {
    const textOnly = new MockAdapter({ capabilities: ["image"] });
    const originalPoll = textOnly.poll.bind(textOnly);
    textOnly.poll = async (handle, ctx) => {
      const result = await originalPoll(handle, ctx);
      return result.status === "succeeded"
        ? { status: "succeeded", output: { kind: "text", text: "oops" } }
        : result;
    };

    await expect(
      generateCharacterView({ ...base(), adapter: textOnly, character, view: "front" }),
    ).rejects.toMatchObject({ code: "provider.bad_output" });
  });
});

describe("generateCharacterSet", () => {
  it("generates the front first and uses it as the reference for the other views", async () => {
    const results = await generateCharacterSet({ ...base(), character });

    expect(Object.keys(results)).toEqual(["front", "left", "right", "back"]);
    expect(adapter.submitted).toHaveLength(4);
    expect(adapter.submitted[0]).not.toHaveProperty("referenceMediaIds", ["m1"]);
    for (const request of adapter.submitted.slice(1)) {
      expect(request).toMatchObject({ referenceMediaIds: ["m1"] });
    }
  });

  it("regenerates only the requested views using an existing front view", async () => {
    const results = await generateCharacterSet({
      ...base(),
      character,
      views: ["left", "back"],
      existingFrontMediaId: "approved-front",
    });

    expect(Object.keys(results)).toEqual(["left", "back"]);
    expect(adapter.submitted).toHaveLength(2);
    expect(adapter.submitted[0]).toMatchObject({ referenceMediaIds: ["approved-front"] });
  });
});

describe("generatePanorama", () => {
  const seamless = () => makeImage(64, 32, (x) => Math.round(128 + 100 * Math.sin((2 * Math.PI * x) / 64)));
  const ramp = () => makeImage(64, 32, (x) => Math.floor((x / 63) * 255));
  const environment = { name: "Village", description: "green fields and a river" };

  it("stores a checked panorama", async () => {
    const result = await generatePanorama({
      ...base(),
      codec: codecFor(seamless()),
      environment,
      assess: RELAXED,
    });

    expect(result.media).toMatchObject({ kind: "panorama", origin: "ai", mime: "image/png", status: "ok" });
    expect(result.fixedSeam).toBe(false);
    expect(result.report.ok).toBe(true);
    expect(adapter.submitted[0]).toMatchObject({ capability: "image", width: 2048, height: 1024 });
    expect((adapter.submitted[0] as { prompt: string }).prompt).toContain("equirectangular");
    expect((adapter.submitted[0] as { prompt: string }).prompt).toContain("green fields");
  });

  it("repairs a visible seam before storing", async () => {
    const result = await generatePanorama({
      ...base(),
      codec: codecFor(ramp()),
      environment,
      assess: RELAXED,
    });

    expect(result.fixedSeam).toBe(true);
    expect(result.media.mime).toBe("image/jpeg");
    expect(result.media.width).toBe(64);
    expect(result.report.ok).toBe(true);
  });

  it("rejects a panorama that cannot be used, so the job can be retried", async () => {
    await expect(
      generatePanorama({
        ...base(),
        codec: codecFor(makeImage(40, 40, () => 100)),
        environment,
        assess: RELAXED,
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === "provider.bad_output");
    expect(await db.mediaRefs.count()).toBe(0);
  });
});

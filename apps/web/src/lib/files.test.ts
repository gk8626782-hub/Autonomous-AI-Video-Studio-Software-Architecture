import { describe, expect, it } from "vitest";
import { createTranslator } from "@avs/i18n";
import { audioExtensionForMime, formatBytes } from "./files";
import { labelOrRaw } from "./labels";

describe("audioExtensionForMime", () => {
  it("maps common audio types", () => {
    expect(audioExtensionForMime("audio/mpeg")).toBe("mp3");
    expect(audioExtensionForMime("audio/WAV")).toBe("wav");
    expect(audioExtensionForMime("audio/mp4")).toBe("m4a");
    expect(audioExtensionForMime("audio/ogg")).toBe("ogg");
    expect(audioExtensionForMime("audio/webm")).toBe("webm");
  });

  it("rejects other types with a translatable error", () => {
    expect(() => audioExtensionForMime("video/mp4")).toThrowError(/Unsupported audio type/);
    try {
      audioExtensionForMime("");
    } catch (error) {
      expect((error as { messageKey: string }).messageKey).toBe("error.media.unsupportedAudio");
    }
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(2 * 1024 ** 4)).toBe("2.0 TB");
  });

  it("returns 0 B for invalid input", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });
});

describe("labelOrRaw", () => {
  const en = createTranslator("en");
  const hi = createTranslator("hi");

  it("translates known values in both languages", () => {
    expect(labelOrRaw(en, "ui.species", "Dog")).toBe("Dog");
    expect(labelOrRaw(hi, "ui.species", "dog")).toBe("कुत्ता");
    expect(labelOrRaw(hi, "ui.age", " Child ")).toBe("बच्चा");
  });

  it("keeps values that have no translation", () => {
    expect(labelOrRaw(hi, "ui.species", "golden retriever")).toBe("golden retriever");
  });
});

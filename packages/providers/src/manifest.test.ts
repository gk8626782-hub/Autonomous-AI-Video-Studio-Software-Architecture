import { describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { assertValidManifest, validateManifest } from "./manifest";
import type { AdapterManifest } from "./types";

const valid: AdapterManifest = {
  id: "my-provider",
  displayName: "My Provider",
  capabilities: ["text", "image"],
  browserCallable: true,
  limits: { image: { maxReferenceImages: 2 } },
  costs: { text: { unit: "per_1k_tokens", priceUsd: 0.001 } },
  features: { referenceImages: true, seed: false, voiceClone: false, voiceDesign: false, languages: ["en"] },
};

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    expect(validateManifest(valid)).toEqual([]);
    expect(() => assertValidManifest(valid)).not.toThrow();
  });

  it("reports a bad id, empty name and missing capabilities", () => {
        const problems = validateManifest({
      ...valid,
      id: "Bad Id",
      displayName: " ",
      capabilities: [],
      limits: {},
      costs: {},
    });
    expect(problems).toHaveLength(3);
  });

  it("reports unknown and duplicate capabilities", () => {
    const problems = validateManifest({
      ...valid,
      capabilities: ["text", "text", "hologram" as never],
    });
    expect(problems.some((p) => p.includes("duplicate capability: text"))).toBe(true);
    expect(problems.some((p) => p.includes("unknown capability: hologram"))).toBe(true);
  });

  it("reports limits and costs for capabilities the provider does not have", () => {
    const problems = validateManifest({
      ...valid,
      limits: { video: { maxDurationSec: 5 } },
      costs: { voice: { unit: "per_1k_chars", priceUsd: 1 } },
    });
    expect(problems.some((p) => p.startsWith("limits declared"))).toBe(true);
    expect(problems.some((p) => p.startsWith("costs declared"))).toBe(true);
  });

  it("reports invalid prices", () => {
    const negative = validateManifest({ ...valid, costs: { text: { unit: "per_request", priceUsd: -1 } } });
    const notFinite = validateManifest({
      ...valid,
      costs: { text: { unit: "per_request", priceUsd: Number.NaN } },
    });
    expect(negative).toContain("invalid price for text");
    expect(notFinite).toContain("invalid price for text");
  });

  it("throws a validation AppError with the problems", () => {
    expect(() => assertValidManifest({ ...valid, id: "X" })).toThrowError(AppError);
    try {
      assertValidManifest({ ...valid, id: "X" });
    } catch (error) {
      expect((error as AppError).code).toBe("validation.invalid_manifest");
    }
  });
});

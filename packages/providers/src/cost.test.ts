import { describe, expect, it } from "vitest";
import { assessBudget, estimateRequestCost, sumEstimates } from "./cost";
import type { AdapterManifest } from "./types";

const manifest: AdapterManifest = {
  id: "priced",
  displayName: "Priced",
  capabilities: ["text", "image", "video", "voice", "music"],
  browserCallable: true,
  limits: {},
  costs: {
    text: { unit: "per_1k_tokens", priceUsd: 0.002 },
    image: { unit: "per_image", priceUsd: 0.04 },
    video: { unit: "per_second", priceUsd: 0.5 },
    voice: { unit: "per_1k_chars", priceUsd: 0.2 },
  },
  features: { referenceImages: false, seed: false, voiceClone: false, voiceDesign: false, languages: [] },
};

describe("estimateRequestCost", () => {
  it("prices video per second", () => {
    expect(
      estimateRequestCost(manifest, { capability: "video", prompt: "x", durationSec: 8, aspectRatio: "16:9" }),
    ).toEqual({ usd: 4, basis: "per_second", approximate: false });
  });

  it("prices images per image and defaults to one", () => {
    expect(estimateRequestCost(manifest, { capability: "image", prompt: "x", count: 3 }).usd).toBe(0.12);
    expect(estimateRequestCost(manifest, { capability: "image", prompt: "x" }).usd).toBe(0.04);
  });

  it("prices voice per 1000 characters", () => {
    const text = "a".repeat(500);
    expect(
      estimateRequestCost(manifest, { capability: "voice", text, voiceId: "v", language: "en" }).usd,
    ).toBe(0.1);
  });

  it("estimates text from input size and output budget and marks it approximate", () => {
    const estimate = estimateRequestCost(manifest, {
      capability: "text",
      prompt: "a".repeat(4000),
      maxTokens: 1000,
    });
    // (4000 / 4 + 1000) / 1000 = 2 thousand tokens * 0.002
    expect(estimate).toEqual({ usd: 0.004, basis: "per_1k_tokens", approximate: true });
  });

  it("returns a zero, approximate estimate when no price is known", () => {
    expect(estimateRequestCost(manifest, { capability: "music", prompt: "x", durationSec: 10 })).toEqual({
      usd: 0,
      basis: "no price information",
      approximate: true,
    });
  });
});

describe("sumEstimates", () => {
  it("adds prices and keeps the approximate flag", () => {
    expect(
      sumEstimates([
        { usd: 0.1, basis: "a", approximate: false },
        { usd: 0.2, basis: "b", approximate: true },
      ]),
    ).toEqual({ usd: 0.3, basis: "total", approximate: true });
  });
});

describe("assessBudget", () => {
  it("allows everything without a cap", () => {
    expect(assessBudget({ capUsd: null, spentUsd: 100, estimateUsd: 100 }).allowed).toBe(true);
  });

  it("allows work that fits the remaining budget", () => {
    expect(assessBudget({ capUsd: 10, spentUsd: 4, estimateUsd: 6 })).toEqual({
      allowed: true,
      remainingUsd: 6,
      wouldExceedByUsd: 0,
    });
  });

  it("blocks work that exceeds the budget and reports by how much", () => {
    expect(assessBudget({ capUsd: 10, spentUsd: 4, estimateUsd: 7.5 })).toEqual({
      allowed: false,
      remainingUsd: 6,
      wouldExceedByUsd: 1.5,
    });
  });
});

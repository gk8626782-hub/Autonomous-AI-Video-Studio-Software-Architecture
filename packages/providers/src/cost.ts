import type { AdapterManifest, CostEstimate, CostUnit, GenerationRequest } from "./types";

const PRECISION = 1_000_000;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

function characterCount(request: GenerationRequest): number {
  switch (request.capability) {
    case "voice":
      return request.text.length;
    case "text":
      return request.prompt.length + (request.system?.length ?? 0);
    default:
      return request.prompt.length;
  }
}

function quantity(unit: CostUnit, request: GenerationRequest): number {
  switch (unit) {
    case "per_request":
      return 1;
    case "per_image":
      return request.capability === "image" ? (request.count ?? 1) : 1;
    case "per_second":
      return request.capability === "video" || request.capability === "music" ? request.durationSec : 0;
    case "per_1k_chars":
      return characterCount(request) / 1000;
    case "per_1k_tokens": {
      // Rough rule of thumb: about 4 characters per token. Output defaults to 1024 tokens.
      const inputTokens = characterCount(request) / 4;
      const outputTokens = request.capability === "text" ? (request.maxTokens ?? 1024) : 0;
      return (inputTokens + outputTokens) / 1000;
    }
  }
}

/** Estimates the price of one request from the manifest's cost model. */
export function estimateRequestCost(manifest: AdapterManifest, request: GenerationRequest): CostEstimate {
  const model = manifest.costs[request.capability];
  if (model === undefined) {
    return { usd: 0, basis: "no price information", approximate: true };
  }
  return {
    usd: round(quantity(model.unit, request) * model.priceUsd),
    basis: model.unit,
    approximate: model.unit === "per_1k_tokens",
  };
}

export function sumEstimates(estimates: readonly CostEstimate[]): CostEstimate {
  return {
    usd: round(estimates.reduce((total, estimate) => total + estimate.usd, 0)),
    basis: "total",
    approximate: estimates.some((estimate) => estimate.approximate),
  };
}

export interface BudgetInput {
  /** Maximum spend for the project in USD. null means no cap. */
  readonly capUsd: number | null;
  readonly spentUsd: number;
  readonly estimateUsd: number;
}

export interface BudgetAssessment {
  readonly allowed: boolean;
  readonly remainingUsd: number;
  readonly wouldExceedByUsd: number;
}

export function assessBudget(input: BudgetInput): BudgetAssessment {
  if (input.capUsd === null) {
    return { allowed: true, remainingUsd: Number.POSITIVE_INFINITY, wouldExceedByUsd: 0 };
  }
  const remainingUsd = round(input.capUsd - input.spentUsd);
  const wouldExceedByUsd = round(Math.max(0, input.estimateUsd - remainingUsd));
  return { allowed: wouldExceedByUsd === 0, remainingUsd, wouldExceedByUsd };
}

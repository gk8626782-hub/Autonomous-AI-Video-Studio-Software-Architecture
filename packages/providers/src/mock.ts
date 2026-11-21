import type { AppError } from "@avs/core";
import { AppError as AppErrorClass } from "@avs/core";
import { estimateRequestCost } from "./cost";
import { providerError } from "./errors";
import { CAPABILITIES } from "./types";
import type {
  AdapterContext,
  AdapterLimits,
  AdapterManifest,
  Capability,
  CostEstimate,
  CostModel,
  GenerationOutput,
  GenerationRequest,
  JobHandle,
  PollResult,
  ProviderAdapter,
} from "./types";

export interface MockAdapterOptions {
  readonly id?: string;
  readonly capabilities?: readonly Capability[];
  /** How many polls report "running" before the job succeeds. Default 1. */
  readonly pollsBeforeDone?: number;
}

interface MockJob {
  readonly request: GenerationRequest;
  polls: number;
  cancelled: boolean;
}

/** Keeps only the entries of a per-capability map that the adapter actually supports. */
function pick<T>(
  source: Partial<Record<Capability, T>>,
  keep: ReadonlySet<Capability>,
): Partial<Record<Capability, T>> {
  const result: Partial<Record<Capability, T>> = {};
  for (const capability of CAPABILITIES) {
    const value = source[capability];
    if (value !== undefined && keep.has(capability)) {
      result[capability] = value;
    }
  }
  return result;
}

function buildOutput(request: GenerationRequest): GenerationOutput {
  switch (request.capability) {
    case "text":
      return {
        kind: "text",
        text: `mock:${request.prompt}`,
        inputTokens: Math.ceil(request.prompt.length / 4),
        outputTokens: 8,
                finishReason: "stop",
      };
    case "image":
      return {
        kind: "media",
        mime: "image/png",
        data: new Blob(["mock-image"], { type: "image/png" }),
        width: request.width ?? 1024,
        height: request.height ?? 1024,
      };
    case "video":
      return {
        kind: "media",
        mime: "video/mp4",
        data: new Blob(["mock-video"], { type: "video/mp4" }),
        durationMs: Math.round(request.durationSec * 1000),
      };
    case "voice":
      return {
        kind: "media",
        mime: "audio/mpeg",
        data: new Blob(["mock-voice"], { type: "audio/mpeg" }),
        durationMs: Math.max(500, request.text.length * 60),
      };
    case "music":
      return {
        kind: "media",
        mime: "audio/mpeg",
        data: new Blob(["mock-music"], { type: "audio/mpeg" }),
        durationMs: Math.round(request.durationSec * 1000),
      };
  }
}

/**
 * Deterministic in-memory provider for tests and local development.
 * Errors can be queued to simulate failures on specific calls.
 */
export class MockAdapter implements ProviderAdapter {
  readonly manifest: AdapterManifest;
  readonly submitted: GenerationRequest[] = [];
  readonly cancelledIds: string[] = [];
  pollCount = 0;

  private readonly jobs = new Map<string, MockJob>();
  private readonly submitErrors: AppError[] = [];
  private readonly pollErrors: AppError[] = [];
  private readonly pollsBeforeDone: number;
  private counter = 0;

  constructor(options: MockAdapterOptions = {}) {
    this.pollsBeforeDone = options.pollsBeforeDone ?? 1;

    const capabilities = options.capabilities ?? CAPABILITIES;
    const supported: ReadonlySet<Capability> = new Set(capabilities);

    this.manifest = {
      id: options.id ?? "mock",
      displayName: "Mock provider",
      capabilities,
      browserCallable: true,
      limits: pick<AdapterLimits>(
        {
          video: { maxDurationSec: 10, aspectRatios: ["16:9", "9:16"], resolutions: ["1080p"] },
          image: { maxReferenceImages: 4 },
        },
        supported,
      ),
      costs: pick<CostModel>(
        {
          text: { unit: "per_1k_tokens", priceUsd: 0.001 },
          image: { unit: "per_image", priceUsd: 0.04 },
          video: { unit: "per_second", priceUsd: 0.5 },
          voice: { unit: "per_1k_chars", priceUsd: 0.2 },
          music: { unit: "per_second", priceUsd: 0.01 },
        },
        supported,
      ),
      features: {
        referenceImages: true,
        seed: true,
        voiceClone: false,
        voiceDesign: true,
        languages: ["en", "hi"],
      },
    };
  }

  /** The next submit() call throws this error. */
  queueSubmitError(error: AppError): void {
    this.submitErrors.push(error);
  }

  /** The next poll() call throws this error. */
  queuePollError(error: AppError): void {
    this.pollErrors.push(error);
  }

  async submit(request: GenerationRequest, _context: AdapterContext): Promise<JobHandle> {
    const queued = this.submitErrors.shift();
    if (queued !== undefined) {
      throw queued;
    }
    if (!this.manifest.capabilities.includes(request.capability)) {
      throw new AppErrorClass({
        code: "validation.unsupported_capability",
        category: "validation",
        messageKey: "error.validation.unsupportedCapability",
        message: `Provider ${this.manifest.id} does not support ${request.capability}`,
        recoverable: false,
        details: { capability: request.capability },
      });
    }

    this.counter += 1;
    const providerJobId = `${this.manifest.id}-job-${this.counter}`;
    this.jobs.set(providerJobId, { request, polls: 0, cancelled: false });
    this.submitted.push(request);
    return { providerId: this.manifest.id, providerJobId, capability: request.capability };
  }

  async poll(handle: JobHandle, _context: AdapterContext): Promise<PollResult> {
    this.pollCount += 1;
    const queued = this.pollErrors.shift();
    if (queued !== undefined) {
      throw queued;
    }

    const job = this.jobs.get(handle.providerJobId);
    if (job === undefined) {
      throw providerError("bad_output", {
        providerId: this.manifest.id,
        message: `Unknown job: ${handle.providerJobId}`,
      });
    }
    if (job.cancelled) {
      throw providerError("cancelled", { providerId: this.manifest.id });
    }

    job.polls += 1;
    if (job.polls <= this.pollsBeforeDone) {
      return { status: "running", progress: job.polls / (this.pollsBeforeDone + 1) };
    }
    return { status: "succeeded", output: buildOutput(job.request) };
  }

  async cancel(handle: JobHandle, _context: AdapterContext): Promise<void> {
    const job = this.jobs.get(handle.providerJobId);
    if (job !== undefined) {
      job.cancelled = true;
    }
    this.cancelledIds.push(handle.providerJobId);
  }

  estimateCost(request: GenerationRequest): CostEstimate {
    return estimateRequestCost(this.manifest, request);
  }
}

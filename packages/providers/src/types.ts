/**
 * Provider-agnostic contracts. Application code only ever talks to these
 * types, so any AI model can be added later as a new adapter.
 */

export const CAPABILITIES = ["text", "image", "video", "voice", "music"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type CostUnit = "per_request" | "per_image" | "per_second" | "per_1k_chars" | "per_1k_tokens";

export interface CostModel {
  readonly unit: CostUnit;
  readonly priceUsd: number;
}

export interface AdapterLimits {
  readonly maxDurationSec?: number;
  readonly resolutions?: readonly string[];
  readonly aspectRatios?: readonly string[];
  readonly maxReferenceImages?: number;
  readonly requestsPerMinute?: number;
  readonly concurrency?: number;
}

export interface AdapterFeatures {
  readonly referenceImages: boolean;
  readonly seed: boolean;
  readonly voiceClone: boolean;
  readonly voiceDesign: boolean;
  readonly languages: readonly string[];
}

/** Declarative description of a provider. Contains no secrets. */
export interface AdapterManifest {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly Capability[];
  /** False when the provider blocks direct browser calls (CORS). */
  readonly browserCallable: boolean;
  readonly limits: Partial<Record<Capability, AdapterLimits>>;
  readonly costs: Partial<Record<Capability, CostModel>>;
  readonly features: AdapterFeatures;
}

export interface TextRequest {
  readonly capability: "text";
  readonly prompt: string;
  readonly system?: string;
  readonly maxTokens?: number;
  readonly responseFormat?: "text" | "json";
}

export interface ImageRequest {
  readonly capability: "image";
  readonly prompt: string;
  readonly width?: number;
  readonly height?: number;
  /** MediaRef ids. Resolved to bytes through AdapterContext.resolveMedia. */
  readonly referenceMediaIds?: readonly string[];
  readonly seed?: number;
  readonly count?: number;
}

export interface VideoRequest {
  readonly capability: "video";
  readonly prompt: string;
  readonly durationSec: number;
  readonly aspectRatio: string;
  readonly resolution?: string;
  readonly referenceMediaIds?: readonly string[];
  readonly seed?: number;
}

export interface VoiceRequest {
  readonly capability: "voice";
  readonly text: string;
  readonly voiceId: string;
  readonly language: string;
  readonly style?: string;
}

export interface MusicRequest {
  readonly capability: "music";
  readonly prompt: string;
  readonly durationSec: number;
  readonly kind?: "music" | "sfx";
}

/** Every request is plain JSON data, so it can be stored in a persisted job. */
export type GenerationRequest =
  | TextRequest
  | ImageRequest
  | VideoRequest
  | VoiceRequest
  | MusicRequest;

export interface TextOutput {
  readonly kind: "text";
  readonly text: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface MediaOutput {
  readonly kind: "media";
  readonly mime: string;
  readonly data: Blob | ReadableStream<Uint8Array>;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
}

export type GenerationOutput = TextOutput | MediaOutput;

/** Serializable reference to a job at the provider. Stored so polling can resume after a reload. */
export interface JobHandle {
  readonly providerId: string;
  readonly providerJobId: string;
  readonly capability: Capability;
}

export type PollResult =
  | { readonly status: "running"; readonly progress?: number }
  | { readonly status: "succeeded"; readonly output: GenerationOutput };

export interface CostEstimate {
  readonly usd: number;
  readonly basis: string;
  readonly approximate: boolean;
}

export interface AdapterContext {
  /** The user's own key, decrypted from the vault just before the call. */
  readonly apiKey: string;
  readonly signal?: AbortSignal;
  readonly resolveMedia: (mediaId: string) => Promise<Blob>;
}

/**
 * Every provider is wrapped into the same asynchronous job shape.
 * Synchronous APIs simply return a finished result on the first poll.
 * Failures are thrown as normalized AppError values (see errors.ts).
 */
export interface ProviderAdapter {
  readonly manifest: AdapterManifest;
  submit(request: GenerationRequest, context: AdapterContext): Promise<JobHandle>;
  /** Returns the current status. Throws a normalized AppError if the job failed. */
  poll(handle: JobHandle, context: AdapterContext): Promise<PollResult>;
  cancel(handle: JobHandle, context: AdapterContext): Promise<void>;
  estimateCost(request: GenerationRequest): CostEstimate;
}

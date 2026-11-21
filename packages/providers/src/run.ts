import { delay } from "@avs/core";
import { providerError } from "./errors";
import type { AdapterContext, GenerationOutput, JobHandle, ProviderAdapter } from "./types";

export interface AwaitOptions {
  readonly intervalMs?: number;
  readonly maxPolls?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onProgress?: (progress: number) => void;
}

/** Polls a provider job until it finishes. Throws a normalized error on failure or timeout. */
export async function awaitOutput(
  adapter: ProviderAdapter,
  handle: JobHandle,
  context: AdapterContext,
  options: AwaitOptions = {},
): Promise<GenerationOutput> {
  const intervalMs = options.intervalMs ?? 2_000;
  const maxPolls = options.maxPolls ?? 900;
  const sleep = options.sleep ?? delay;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (context.signal?.aborted === true) {
      throw providerError("cancelled", { providerId: handle.providerId });
    }

    const result = await adapter.poll(handle, context);
    if (result.status === "succeeded") {
      return result.output;
    }
    if (result.progress !== undefined) {
      options.onProgress?.(result.progress);
    }
    await sleep(intervalMs);
  }

  throw providerError("transient", {
    providerId: handle.providerId,
    message: "Timed out waiting for the provider job",
  });
}

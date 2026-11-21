import { describe, expect, it, vi } from "vitest";
import { providerError } from "./errors";
import { MockAdapter } from "./mock";
import { awaitOutput } from "./run";
import type { AdapterContext } from "./types";

const request = { capability: "text", prompt: "hi" } as const;

function makeContext(signal?: AbortSignal): AdapterContext {
  return { apiKey: "k", resolveMedia: async () => new Blob(), ...(signal === undefined ? {} : { signal }) };
}

describe("awaitOutput", () => {
  it("polls until the job succeeds and reports progress", async () => {
    const adapter = new MockAdapter({ pollsBeforeDone: 2 });
    const context = makeContext();
    const handle = await adapter.submit(request, context);
    const sleep = vi.fn(async () => undefined);
    const progress: number[] = [];

    const output = await awaitOutput(adapter, handle, context, {
      sleep,
      intervalMs: 10,
      onProgress: (value) => progress.push(value),
    });

    expect(output).toMatchObject({ kind: "text", text: "mock:hi" });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(progress).toHaveLength(2);
  });

  it("times out with a retryable transient error", async () => {
    const adapter = new MockAdapter({ pollsBeforeDone: 100 });
    const context = makeContext();
    const handle = await adapter.submit(request, context);

    await expect(
      awaitOutput(adapter, handle, context, { sleep: async () => undefined, maxPolls: 3 }),
    ).rejects.toMatchObject({ code: "provider.transient", details: { retryable: true } });
    expect(adapter.pollCount).toBe(3);
  });

  it("stops with a cancelled error when the signal is aborted", async () => {
    const adapter = new MockAdapter();
    const controller = new AbortController();
    const context = makeContext(controller.signal);
    const handle = await adapter.submit(request, context);
    controller.abort();

    await expect(awaitOutput(adapter, handle, context, { sleep: async () => undefined })).rejects.toMatchObject({
      code: "provider.cancelled",
    });
    expect(adapter.pollCount).toBe(0);
  });

  it("propagates provider failures from poll", async () => {
    const adapter = new MockAdapter();
    const context = makeContext();
    const handle = await adapter.submit(request, context);
    adapter.queuePollError(providerError("auth", { providerId: "mock" }));

    await expect(awaitOutput(adapter, handle, context, { sleep: async () => undefined })).rejects.toMatchObject({
      code: "provider.auth",
    });
  });
});

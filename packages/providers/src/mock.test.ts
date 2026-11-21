import { describe, expect, it } from "vitest";
import { runAdapterContract } from "./testing/contract";
import type { ContractSamples } from "./testing/contract";
import { providerError } from "./errors";
import { MockAdapter } from "./mock";
import type { AdapterContext } from "./types";

const context: AdapterContext = { apiKey: "k", resolveMedia: async () => new Blob() };

const samples: ContractSamples = {
  text: { capability: "text", prompt: "hello" },
  image: { capability: "image", prompt: "a cat" },
  video: { capability: "video", prompt: "a cat runs", durationSec: 5, aspectRatio: "16:9" },
  voice: { capability: "voice", text: "namaste", voiceId: "v1", language: "hi" },
  music: { capability: "music", prompt: "calm", durationSec: 30 },
};

runAdapterContract("MockAdapter", () => new MockAdapter(), samples);

describe("MockAdapter behavior", () => {
  it("reports running before it succeeds", async () => {
    const adapter = new MockAdapter({ pollsBeforeDone: 2 });
    const handle = await adapter.submit(samples.text!, context);

    expect(await adapter.poll(handle, context)).toEqual({ status: "running", progress: 1 / 3 });
    expect(await adapter.poll(handle, context)).toEqual({ status: "running", progress: 2 / 3 });
    const done = await adapter.poll(handle, context);
    expect(done).toMatchObject({ status: "succeeded", output: { kind: "text", text: "mock:hello" } });
  });

  it("returns media with metadata", async () => {
    const adapter = new MockAdapter({ pollsBeforeDone: 0 });
    const handle = await adapter.submit(samples.video!, context);
    const result = await adapter.poll(handle, context);

    expect(result).toMatchObject({
      status: "succeeded",
      output: { kind: "media", mime: "video/mp4", durationMs: 5000 },
    });
  });

  it("throws queued submit and poll errors once, in order", async () => {
    const adapter = new MockAdapter();
    adapter.queueSubmitError(providerError("quota", { providerId: "mock" }));
    await expect(adapter.submit(samples.text!, context)).rejects.toMatchObject({ code: "provider.quota" });

    const handle = await adapter.submit(samples.text!, context);
    adapter.queuePollError(providerError("transient", { providerId: "mock" }));
    await expect(adapter.poll(handle, context)).rejects.toMatchObject({ code: "provider.transient" });
    await expect(adapter.poll(handle, context)).resolves.toMatchObject({ status: "running" });
    expect(adapter.pollCount).toBe(2);
  });

  it("rejects capabilities it does not support", async () => {
    const adapter = new MockAdapter({ capabilities: ["text"] });
    await expect(adapter.submit(samples.video!, context)).rejects.toMatchObject({
      code: "validation.unsupported_capability",
    });
  });

  it("records submitted requests and cancellations", async () => {
    const adapter = new MockAdapter();
    const handle = await adapter.submit(samples.text!, context);
    await adapter.cancel(handle, context);

    expect(adapter.submitted).toEqual([samples.text]);
    expect(adapter.cancelledIds).toEqual([handle.providerJobId]);
    await expect(adapter.poll(handle, context)).rejects.toMatchObject({ code: "provider.cancelled" });
  });

  it("fails for a job it does not know", async () => {
    const adapter = new MockAdapter();
    await expect(
      adapter.poll({ providerId: "mock", providerJobId: "ghost", capability: "text" }, context),
    ).rejects.toMatchObject({ code: "provider.bad_output" });
  });
});

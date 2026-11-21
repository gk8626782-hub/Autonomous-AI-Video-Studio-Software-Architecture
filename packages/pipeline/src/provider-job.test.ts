import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioDatabase } from "@avs/storage";
import { MockAdapter, awaitOutput, offlineError } from "@avs/providers";
import type { AdapterContext, GenerationRequest, JobHandle } from "@avs/providers";
import { JobQueue } from "./queue";

let db: StudioDatabase;
let queue: JobQueue;
let adapter: MockAdapter;

/**
 * The shape every real provider job handler will follow:
 * submit once, store the provider job id, then poll. After a reload or a lost
 * connection the stored id is used to keep polling instead of submitting again.
 */
function registerGenerateHandler(): void {
  queue.register("provider.generate", {
    requiresNetwork: true,
    run: async ({ job, signal, setProviderJobId }) => {
      const request = job.payload as GenerationRequest;
      const context: AdapterContext = { apiKey: "test-key", signal, resolveMedia: async () => new Blob() };

      let handle: JobHandle;
      if (job.providerJobId === null) {
        handle = await adapter.submit(request, context);
        await setProviderJobId(handle.providerJobId);
      } else {
        handle = {
          providerId: adapter.manifest.id,
          providerJobId: job.providerJobId,
          capability: request.capability,
        };
      }

      const output = await awaitOutput(adapter, handle, context, { sleep: async () => undefined });
      return output.kind === "text" ? { text: output.text } : { mime: output.mime };
    },
  });
}

beforeEach(() => {
  db = new StudioDatabase(`avs-provider-job-${Math.random().toString(36).slice(2)}`);
  adapter = new MockAdapter({ pollsBeforeDone: 1 });
  queue = new JobQueue(db, { isOnline: () => true, random: () => 0 });
  registerGenerateHandler();
});

afterEach(async () => {
  queue.stop();
  await db.delete();
});

describe("provider job through the queue", () => {
  it("completes a text generation", async () => {
    const created = await queue.enqueue({
      projectId: "p1",
      type: "provider.generate",
      payload: { capability: "text", prompt: "hello" } satisfies GenerationRequest,
      idempotencyKey: "text-1",
    });

    await queue.drain();

    expect(await queue.get(created.id)).toMatchObject({ state: "done", result: { text: "mock:hello" } });
    expect(adapter.submitted).toHaveLength(1);
  });

  it("resumes polling after the connection drops without submitting again", async () => {
    adapter.queuePollError(offlineError("mock"));
    const created = await queue.enqueue({
      projectId: "p1",
      type: "provider.generate",
      payload: {
        capability: "video",
        prompt: "a long walk",
        durationSec: 5,
        aspectRatio: "16:9",
      } satisfies GenerationRequest,
      idempotencyKey: "video-1",
    });

    await queue.drain();

    const finished = await queue.get(created.id);
    expect(finished).toMatchObject({ state: "done", attempts: 1, result: { mime: "video/mp4" } });
    expect(finished?.providerJobId).toBe("mock-job-1");
    expect(adapter.submitted).toHaveLength(1);
  });

  it("resumes after a simulated restart using the stored provider job id", async () => {
    const created = await queue.enqueue({
      projectId: "p1",
      type: "provider.generate",
      payload: { capability: "text", prompt: "resume me" } satisfies GenerationRequest,
      idempotencyKey: "text-2",
    });

    // The provider accepted the job, then the page closed while it was running.
    const handle = await adapter.submit({ capability: "text", prompt: "resume me" }, {
      apiKey: "k",
      resolveMedia: async () => new Blob(),
    });
    await db.jobs.update(created.id, {
      state: "running",
      attempts: 1,
      providerJobId: handle.providerJobId,
    });

    await queue.recover();
    await queue.drain();

    expect(await queue.get(created.id)).toMatchObject({ state: "done", result: { text: "mock:resume me" } });
    expect(adapter.submitted).toHaveLength(1);
  });
});

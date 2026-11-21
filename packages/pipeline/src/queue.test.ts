import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError, OFFLINE_ERROR_CODE } from "@avs/core";
import { StudioDatabase } from "@avs/storage";
import { JobQueue } from "./queue";

let db: StudioDatabase;
let queue: JobQueue;
let clock: number;
let online: boolean;
let counter: number;

function retryable(code = "x.transient"): AppError {
  return new AppError({
    code,
    category: "network",
    messageKey: "error.x",
    message: "flaky",
    recoverable: true,
    details: { retryable: true },
  });
}

function permanent(code = "x.permanent"): AppError {
  return new AppError({
    code,
    category: "media",
    messageKey: "error.y",
    message: "broken",
    recoverable: false,
  });
}

function offline(): AppError {
  return new AppError({
    code: OFFLINE_ERROR_CODE,
    category: "network",
    messageKey: "error.network.offline",
    message: "offline",
    recoverable: true,
  });
}

function sleepReal(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function job(type: string, key = "k1", projectId = "p1") {
  return { projectId, type, payload: { n: 1 }, idempotencyKey: key };
}

function makeQueue(options: { maxConcurrent?: number } = {}): JobQueue {
  return new JobQueue(db, {
    now: () => clock,
    newId: () => `job-${++counter}`,
    isOnline: () => online,
    random: () => 0,
    backoff: { baseMs: 1000, maxMs: 60_000 },
    ...options,
  });
}

beforeEach(() => {
  db = new StudioDatabase(`avs-queue-${Math.random().toString(36).slice(2)}`);
  clock = 1_000;
  online = true;
  counter = 0;
  queue = makeQueue();
});

afterEach(async () => {
  queue.stop();
  await db.delete();
});

describe("enqueue", () => {
  it("is idempotent per project and key", async () => {
    const a = await queue.enqueue(job("echo", "same"));
    const b = await queue.enqueue(job("echo", "same"));
    const c = await queue.enqueue(job("echo", "same", "p2"));

    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
    expect(await db.jobs.count()).toBe(2);
  });

  it("rejects empty types and keys", async () => {
    await expect(queue.enqueue(job("", "k"))).rejects.toMatchObject({ code: "validation.invalid_job_type" });
    await expect(queue.enqueue(job("echo", ""))).rejects.toMatchObject({
      code: "validation.invalid_idempotency_key",
    });
  });

  it("rejects duplicate handler registration", () => {
    queue.register("echo", { requiresNetwork: false, run: async () => 1 });
    expect(() => queue.register("echo", { requiresNetwork: false, run: async () => 2 })).toThrowError(
      /already registered/,
    );
  });
});

describe("running jobs", () => {
  it("runs a job to completion and stores the result", async () => {
    queue.register("echo", { requiresNetwork: false, run: async ({ job: j }) => ({ echoed: j.payload }) });
    const created = await queue.enqueue(job("echo"));

    await queue.drain();

    expect(await queue.get(created.id)).toMatchObject({
      state: "done",
      attempts: 1,
      result: { echoed: { n: 1 } },
      error: null,
    });
  });

  it("fails jobs whose type has no handler", async () => {
    const created = await queue.enqueue(job("nope"));
    await queue.drain();

    expect(await queue.get(created.id)).toMatchObject({
      state: "failed",
      error: { code: "job.no_handler" },
    });
  });

  it("persists the provider job id from the handler", async () => {
    queue.register("remote", {
      requiresNetwork: false,
      run: async ({ setProviderJobId }) => {
        await setProviderJobId("remote-42");
        return "ok";
      },
    });
    const created = await queue.enqueue(job("remote"));
    await queue.drain();

    expect((await queue.get(created.id))?.providerJobId).toBe("remote-42");
  });

  it("limits how many jobs run at the same time", async () => {
    let active = 0;
    let maxActive = 0;
    const run = async (): Promise<string> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleepReal(10);
      active -= 1;
      return "ok";
    };

    const limited = makeQueue({ maxConcurrent: 1 });
    limited.register("work", { requiresNetwork: false, run });
    for (const key of ["a", "b", "c"]) {
      await limited.enqueue(job("work", key));
    }
    await limited.drain();
    expect(maxActive).toBe(1);

    maxActive = 0;
    const wide = makeQueue({ maxConcurrent: 2 });
    wide.register("work", { requiresNetwork: false, run });
    for (const key of ["d", "e", "f"]) {
      await wide.enqueue(job("work", key, "p2"));
    }
    await wide.drain();
    expect(maxActive).toBe(2);
  });

  it("honors a per-type concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const wide = makeQueue({ maxConcurrent: 3 });
    wide.register("video", {
      requiresNetwork: false,
      concurrency: 1,
      run: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleepReal(10);
        active -= 1;
        return "ok";
      },
    });
    for (const key of ["a", "b", "c"]) {
      await wide.enqueue(job("video", key));
    }
    await wide.drain();
    expect(maxActive).toBe(1);
    expect(await db.jobs.where("state").equals("done").count()).toBe(3);
  });
});

describe("retries", () => {
  it("waits with backoff after a retryable error, then succeeds", async () => {
    let calls = 0;
    queue.register("flaky", {
      requiresNetwork: false,
      run: async () => {
        calls += 1;
        if (calls === 1) {
          throw retryable();
        }
        return "ok";
      },
    });
    const created = await queue.enqueue(job("flaky"));

    await queue.drain();
    expect(await queue.get(created.id)).toMatchObject({
      state: "retry-wait",
      attempts: 1,
      nextRunAt: 1_500,
      error: { code: "x.transient", messageKey: "error.x" },
    });

    await queue.drain();
    expect(calls).toBe(1);

    clock = 1_500;
    await queue.drain();
    expect(await queue.get(created.id)).toMatchObject({ state: "done", attempts: 2, error: null });
  });

  it("fails immediately on a non-retryable error", async () => {
    queue.register("broken", {
      requiresNetwork: false,
      run: async () => {
        throw permanent();
      },
    });
    const created = await queue.enqueue(job("broken"));
    await queue.drain();

    expect(await queue.get(created.id)).toMatchObject({
      state: "failed",
      attempts: 1,
      error: { code: "x.permanent" },
    });
  });

  it("fails once the attempts are used up", async () => {
    queue.register("always", {
      requiresNetwork: false,
      maxAttempts: 2,
      run: async () => {
        throw retryable();
      },
    });
    const created = await queue.enqueue(job("always"));

    await queue.drain();
    clock = 10_000;
    await queue.drain();

    expect(await queue.get(created.id)).toMatchObject({ state: "failed", attempts: 2 });
  });

  it("lets the user retry a failed job from scratch", async () => {
    let calls = 0;
    queue.register("once", {
      requiresNetwork: false,
      run: async () => {
        calls += 1;
        if (calls === 1) {
          throw permanent();
        }
        return "ok";
      },
    });
    const created = await queue.enqueue(job("once"));
    await queue.drain();
    expect((await queue.get(created.id))?.state).toBe("failed");

    await queue.retry(created.id);
    await queue.drain();

    expect(await queue.get(created.id)).toMatchObject({ state: "done", attempts: 1, error: null });
  });
});

describe("offline handling", () => {
  it("holds network jobs while offline and runs them when the connection returns", async () => {
    let calls = 0;
    queue.register("net", {
      requiresNetwork: true,
      run: async () => {
        calls += 1;
        return "ok";
      },
    });
    const created = await queue.enqueue(job("net"));

    online = false;
    await queue.drain();
    expect(calls).toBe(0);
    expect((await queue.get(created.id))?.state).toBe("paused-offline");

    online = true;
    await queue.drain();
    expect(calls).toBe(1);
    expect(await queue.get(created.id)).toMatchObject({ state: "done", attempts: 1 });
  });

  it("still runs local jobs while offline", async () => {
    queue.register("local", { requiresNetwork: false, run: async () => "ok" });
    const created = await queue.enqueue(job("local"));

    online = false;
    await queue.drain();

    expect((await queue.get(created.id))?.state).toBe("done");
  });

  it("pauses without counting an attempt when the connection drops mid-job", async () => {
    let calls = 0;
    queue.register("net", {
      requiresNetwork: true,
      run: async () => {
        calls += 1;
        if (calls === 1) {
          online = false;
          throw offline();
        }
        return "ok";
      },
    });
    const created = await queue.enqueue(job("net"));

    await queue.drain();
    expect(await queue.get(created.id)).toMatchObject({ state: "paused-offline", attempts: 0, error: null });

    online = true;
    await queue.drain();
    expect(await queue.get(created.id)).toMatchObject({ state: "done", attempts: 1 });
    expect(calls).toBe(2);
  });
});

describe("recovery and cancellation", () => {
  it("puts jobs that were running at shutdown back in the queue and keeps the provider job id", async () => {
    const created = await queue.enqueue(job("resume"));
    await db.jobs.update(created.id, { state: "running", attempts: 1, providerJobId: "remote-1" });

    let seen: string | null = null;
    queue.register("resume", {
      requiresNetwork: false,
      run: async ({ job: j }) => {
        seen = j.providerJobId;
        return "ok";
      },
    });

    expect(await queue.recover()).toBe(1);
    expect((await queue.get(created.id))?.state).toBe("queued");

    await queue.drain();
    expect(seen).toBe("remote-1");
    expect(await queue.get(created.id)).toMatchObject({ state: "done", attempts: 2 });
  });

  it("cancels a running job", async () => {
    let signalStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    queue.register("slow", {
      requiresNetwork: false,
      run: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signalStarted();
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    const created = await queue.enqueue(job("slow"));

    await queue.tick();
    await started;
    await queue.cancel(created.id);
    await queue.idle();

    expect(await queue.get(created.id)).toMatchObject({ state: "failed", error: { code: "job.cancelled" } });
  });

  it("cancels a queued job and ignores finished jobs", async () => {
    queue.register("echo", { requiresNetwork: false, run: async () => "ok" });
    const waiting = await queue.enqueue(job("echo", "waiting"));
    await queue.cancel(waiting.id);
    expect(await queue.get(waiting.id)).toMatchObject({ state: "failed", error: { code: "job.cancelled" } });

    const finished = await queue.enqueue(job("echo", "finished"));
    await queue.drain();
    await queue.cancel(finished.id);
    expect((await queue.get(finished.id))?.state).toBe("done");
  });
});

describe("listing", () => {
  it("lists jobs oldest first, optionally per project", async () => {
    await queue.enqueue(job("echo", "a", "p1"));
    clock = 2_000;
    await queue.enqueue(job("echo", "b", "p2"));

    expect((await queue.list()).map((j) => j.idempotencyKey)).toEqual(["a", "b"]);
    expect((await queue.list("p2")).map((j) => j.idempotencyKey)).toEqual(["b"]);
  });
});

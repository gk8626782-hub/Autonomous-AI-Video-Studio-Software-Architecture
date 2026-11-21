import {
  AppError,
  OFFLINE_ERROR_CODE,
  computeBackoffMs,
  isRetryableError,
  toAppError,
} from "@avs/core";
import type { BackoffOptions } from "@avs/core";
import type { JobRecord, JobState, StudioDatabase } from "@avs/storage";

export interface EnqueueInput {
  readonly projectId: string;
  readonly type: string;
  /** Must be JSON-serializable. */
  readonly payload: unknown;
  /** Enqueuing the same key twice in a project returns the existing job. */
  readonly idempotencyKey: string;
}

export interface JobContext {
  readonly job: JobRecord;
  readonly signal: AbortSignal;
  /** Persist the provider's job id as soon as it is known so a reload can resume polling. */
  setProviderJobId(providerJobId: string): Promise<void>;
}

export interface JobHandlerConfig {
  /** Network jobs pause while offline and resume automatically afterwards. */
  readonly requiresNetwork: boolean;
  readonly maxAttempts?: number;
  /** Maximum simultaneous jobs of this type. */
  readonly concurrency?: number;
  /** Returns the JSON-serializable result. Throw AppError to fail. */
  readonly run: (context: JobContext) => Promise<unknown>;
}

export interface JobQueueOptions {
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly isOnline?: () => boolean;
  readonly random?: () => number;
  readonly maxConcurrent?: number;
  readonly defaultMaxAttempts?: number;
  readonly backoff?: BackoffOptions;
}

const RUNNABLE_STATES: JobState[] = ["queued", "paused-offline", "retry-wait"];

function validation(field: string, message: string): AppError {
  return new AppError({
    code: `validation.invalid_${field}`,
    category: "validation",
    messageKey: `error.validation.${field}`,
    message,
    recoverable: false,
    details: { field },
  });
}

/**
 * Persistent job queue. Every state change is written to IndexedDB, so a
 * reload, crash or lost connection never loses work.
 *
 * States: queued -> running -> done | failed, with paused-offline (waiting for
 * the network) and retry-wait (waiting for a backoff delay) in between.
 */
export class JobQueue {
  private readonly handlers = new Map<string, JobHandlerConfig>();
  /** Jobs started by this queue instance and not finished yet. */
  private readonly claimed = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly cancelRequested = new Set<string>();
  private readonly runningByType = new Map<string, number>();
  private readonly inFlight = new Set<Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;

  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly isOnline: () => boolean;
  private readonly random: () => number;
  private readonly maxConcurrent: number;
  private readonly defaultMaxAttempts: number;
  private readonly backoff: BackoffOptions;

  constructor(
    private readonly db: StudioDatabase,
    options: JobQueueOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.isOnline =
      options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
    this.random = options.random ?? Math.random;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.backoff = options.backoff ?? {};
  }

  register(type: string, config: JobHandlerConfig): void {
    if (this.handlers.has(type)) {
      throw validation("job_type", `Job handler already registered: ${type}`);
    }
    this.handlers.set(type, config);
  }

  async enqueue(input: EnqueueInput): Promise<JobRecord> {
    if (input.type.length === 0) {
      throw validation("job_type", "Job type must not be empty");
    }
    if (input.idempotencyKey.length === 0) {
      throw validation("idempotency_key", "Idempotency key must not be empty");
    }

    return this.db.transaction("rw", this.db.jobs, async () => {
      const existing = await this.db.jobs
        .where("projectId")
        .equals(input.projectId)
        .filter((job) => job.idempotencyKey === input.idempotencyKey)
        .first();
      if (existing !== undefined) {
        return existing;
      }

      const timestamp = this.now();
      const record: JobRecord = {
        id: this.newId(),
        projectId: input.projectId,
        type: input.type,
        payload: input.payload,
        state: "queued",
        attempts: 0,
        providerJobId: null,
        idempotencyKey: input.idempotencyKey,
        error: null,
        nextRunAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.db.jobs.add(record);
      return record;
    });
  }

  get(id: string): Promise<JobRecord | undefined> {
    return this.db.jobs.get(id);
  }

  async list(projectId?: string): Promise<JobRecord[]> {
    const jobs =
      projectId === undefined
        ? await this.db.jobs.toArray()
        : await this.db.jobs.where("projectId").equals(projectId).toArray();
    return jobs.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  /**
   * Call once at startup. Jobs that were running when the page closed go back
   * to the queue. Their providerJobId is kept, so the handler resumes polling
   * instead of submitting again.
   */
  async recover(): Promise<number> {
    const stuck = await this.db.jobs
      .where("state")
      .equals("running")
      .filter((job) => !this.claimed.has(job.id))
      .toArray();
    for (const job of stuck) {
      await this.db.jobs.update(job.id, { state: "queued", updatedAt: this.now() });
    }
    return stuck.length;
  }

  /** Cancels a queued, waiting or running job. Finished jobs are left alone. */
  async cancel(id: string): Promise<void> {
    const job = await this.db.jobs.get(id);
    if (job === undefined || job.state === "done" || job.state === "failed") {
      return;
    }

    const controller = this.controllers.get(id);
    if (controller !== undefined) {
      this.cancelRequested.add(id);
      controller.abort();
      return;
    }

    await this.db.jobs.update(id, {
      state: "failed",
      error: { code: "job.cancelled", messageKey: "error.job.cancelled" },
      nextRunAt: null,
      updatedAt: this.now(),
    });
  }

  /** User-initiated retry of a failed job. Starts fresh with no provider job id. */
  async retry(id: string): Promise<void> {
    const job = await this.db.jobs.get(id);
    if (job === undefined || job.state !== "failed") {
      return;
    }
    await this.db.jobs.update(id, {
      state: "queued",
      attempts: 0,
      providerJobId: null,
      error: null,
      nextRunAt: null,
      updatedAt: this.now(),
    });
  }

  /**
   * Starts every job that can run now and returns how many were started.
   * It does not wait for them to finish.
   */
  async tick(): Promise<number> {
    const candidates = await this.db.jobs.where("state").anyOf(RUNNABLE_STATES).toArray();

    // Selection and claiming happen in one synchronous block, so two
    // overlapping ticks can never start the same job twice.
    const now = this.now();
    const online = this.isOnline();
    const ready = candidates
      .filter((job) => !this.claimed.has(job.id))
      .filter((job) => job.state !== "retry-wait" || (job.nextRunAt ?? 0) <= now)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

    const toStart: Array<{ job: JobRecord; handler: JobHandlerConfig }> = [];
    const toPause: JobRecord[] = [];
    const toFail: JobRecord[] = [];
    let capacity = this.maxConcurrent - this.claimed.size;

    for (const job of ready) {
      const handler = this.handlers.get(job.type);
      if (handler === undefined) {
        toFail.push(job);
        continue;
      }
      if (handler.requiresNetwork && !online) {
        if (job.state !== "paused-offline") {
          toPause.push(job);
        }
        continue;
      }
      if (capacity <= 0) {
        continue;
      }
      const used = this.runningByType.get(job.type) ?? 0;
      if (handler.concurrency !== undefined && used >= handler.concurrency) {
        continue;
      }

      capacity -= 1;
      this.claimed.add(job.id);
      this.runningByType.set(job.type, used + 1);
      toStart.push({ job, handler });
    }

    for (const { job, handler } of toStart) {
      const run: Promise<void> = this.execute(job, handler)
        .catch(() => undefined)
        .finally(() => {
          this.inFlight.delete(run);
        });
      this.inFlight.add(run);
    }

    for (const job of toPause) {
      await this.db.jobs.update(job.id, { state: "paused-offline", updatedAt: this.now() });
    }
    for (const job of toFail) {
      await this.db.jobs.update(job.id, {
        state: "failed",
        error: { code: "job.no_handler", messageKey: "error.job.noHandler" },
        updatedAt: this.now(),
      });
    }

    return toStart.length;
  }

  /** Resolves when no started job is still running. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.race([...this.inFlight]);
    }
  }

  /**
   * Runs jobs until nothing more can run right now. Jobs waiting for a retry
   * delay or for the network stay in the queue. Mainly used by tests.
   */
  async drain(): Promise<void> {
    for (;;) {
      const started = await this.tick();
      if (this.inFlight.size > 0) {
        await this.idle();
        continue;
      }
      if (started === 0) {
        return;
      }
    }
  }

  /** Polls the queue on a timer. Call tick() from "online" events for a faster resume. */
  start(intervalMs = 1_000): void {
    if (this.timer !== undefined) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async execute(job: JobRecord, handler: JobHandlerConfig): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    const attempt = job.attempts + 1;

    try {
      const startedAt = this.now();
      await this.db.jobs.update(job.id, {
        state: "running",
        attempts: attempt,
        nextRunAt: null,
        error: null,
        updatedAt: startedAt,
      });

      const running: JobRecord = {
        ...job,
        state: "running",
        attempts: attempt,
        nextRunAt: null,
        error: null,
        updatedAt: startedAt,
      };
      const result = await handler.run({
        job: running,
        signal: controller.signal,
        setProviderJobId: async (providerJobId) => {
          await this.db.jobs.update(job.id, { providerJobId, updatedAt: this.now() });
        },
      });

      await this.db.jobs.update(job.id, {
        state: "done",
        result,
        error: null,
        nextRunAt: null,
        updatedAt: this.now(),
      });
    } catch (cause) {
      await this.settleFailure(job, attempt, handler, cause);
    } finally {
      this.controllers.delete(job.id);
      this.cancelRequested.delete(job.id);
      this.claimed.delete(job.id);
      const remaining = (this.runningByType.get(job.type) ?? 1) - 1;
      if (remaining <= 0) {
        this.runningByType.delete(job.type);
      } else {
        this.runningByType.set(job.type, remaining);
      }
    }
  }

  private async settleFailure(
    job: JobRecord,
    attempt: number,
    handler: JobHandlerConfig,
    cause: unknown,
  ): Promise<void> {
    const error = toAppError(cause);
    const now = this.now();

    if (this.cancelRequested.has(job.id)) {
      await this.db.jobs.update(job.id, {
        state: "failed",
        error: { code: "job.cancelled", messageKey: "error.job.cancelled" },
        nextRunAt: null,
        updatedAt: now,
      });
      return;
    }

    if (error.code === OFFLINE_ERROR_CODE) {
      // Losing the connection is not the job's fault, so the attempt is not counted.
      await this.db.jobs.update(job.id, {
        state: "paused-offline",
        attempts: job.attempts,
        error: null,
        nextRunAt: null,
        updatedAt: now,
      });
      return;
    }

    const stored = { code: error.code, messageKey: error.messageKey };
    const maxAttempts = handler.maxAttempts ?? this.defaultMaxAttempts;

    if (isRetryableError(error) && attempt < maxAttempts) {
      await this.db.jobs.update(job.id, {
        state: "retry-wait",
        error: stored,
        nextRunAt: now + computeBackoffMs(attempt, this.backoff, this.random),
        updatedAt: now,
      });
      return;
    }

    await this.db.jobs.update(job.id, {
      state: "failed",
      error: stored,
      nextRunAt: null,
      updatedAt: now,
    });
  }
}

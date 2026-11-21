import { describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
import { computeBackoffMs, isRetryableError, withRetry } from "./retry";

function makeError(retryable: boolean): AppError {
  return new AppError({
    code: "test.error",
    category: "network",
    messageKey: "error.test",
    message: "test",
    recoverable: true,
    details: { retryable },
  });
}

describe("computeBackoffMs", () => {
  it("is half the ceiling with no randomness and the full ceiling with maximum randomness", () => {
    expect(computeBackoffMs(1, { baseMs: 1000 }, () => 0)).toBe(500);
    expect(computeBackoffMs(1, { baseMs: 1000 }, () => 1)).toBe(1000);
    expect(computeBackoffMs(3, { baseMs: 1000 }, () => 0)).toBe(2000);
    expect(computeBackoffMs(3, { baseMs: 1000 }, () => 1)).toBe(4000);
  });

  it("is capped by maxMs", () => {
    expect(computeBackoffMs(20, { baseMs: 1000, maxMs: 30_000 }, () => 1)).toBe(30_000);
    expect(computeBackoffMs(20, { baseMs: 1000, maxMs: 30_000 }, () => 0)).toBe(15_000);
  });

  it("treats attempts below 1 like the first attempt", () => {
    expect(computeBackoffMs(0, { baseMs: 1000 }, () => 0)).toBe(500);
  });
});

describe("isRetryableError", () => {
  it("reads the retryable flag from details", () => {
    expect(isRetryableError(makeError(true))).toBe(true);
    expect(isRetryableError(makeError(false))).toBe(false);
  });
});

describe("withRetry", () => {
    const sleep = vi.fn(async (_ms: number): Promise<void> => undefined);

  it("returns the first successful result", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withRetry(fn, { sleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors with backoff and reports each retry", async () => {
    sleep.mockClear();
    const onRetry = vi.fn();
    let calls = 0;
    const result = await withRetry(
      async (attempt) => {
        calls += 1;
        if (attempt < 3) {
          throw makeError(true);
        }
        return "done";
      },
      { sleep, random: () => 0, baseMs: 1000, maxAttempts: 5, onRetry },
    );

    expect(result).toBe("done");
    expect(calls).toBe(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([500, 1000]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts", async () => {
    const fn = vi.fn(async () => {
      throw makeError(true);
    });
    await expect(withRetry(fn, { sleep, maxAttempts: 2 })).rejects.toBeInstanceOf(AppError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      throw makeError(false);
    });
    await expect(withRetry(fn, { sleep })).rejects.toBeInstanceOf(AppError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(async () => {
      throw makeError(true);
    });
    await expect(withRetry(fn, { sleep, signal: controller.signal })).rejects.toBeInstanceOf(AppError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

import { toAppError } from "./errors";
import type { AppError } from "./errors";

/** Code of the error that means "there is no internet connection right now". */
export const OFFLINE_ERROR_CODE = "network.offline";

export interface BackoffOptions {
  readonly baseMs?: number;
  readonly maxMs?: number;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with "equal jitter": half of the delay is fixed and
 * half is random, so retries spread out but never fire almost immediately.
 * attempt is 1-based: the attempt that just failed.
 */
export function computeBackoffMs(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  const baseMs = options.baseMs ?? 1_000;
  const maxMs = options.maxMs ?? 60_000;
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const ceiling = Math.min(maxMs, baseMs * 2 ** exponent);
  const half = ceiling / 2;
  return Math.round(half + random() * half);
}

/** An error is retryable when its details carry retryable: true. */
export function isRetryableError(error: AppError): boolean {
  return error.details?.["retryable"] === true;
}

export interface RetryOptions extends BackoffOptions {
  readonly maxAttempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly signal?: AbortSignal;
  readonly onRetry?: (error: AppError, attempt: number, delayMs: number) => void;
}

/** Runs fn and retries retryable errors with backoff. Other errors are thrown at once. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleep ?? delay;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (cause) {
      const error = toAppError(cause);
      if (attempt >= maxAttempts || !isRetryableError(error) || options.signal?.aborted === true) {
        throw error;
      }
      const delayMs = computeBackoffMs(attempt, options, options.random);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}

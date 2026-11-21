import { AppError, toAppError } from "@avs/core";
import type { ProviderAdapter } from "./types";

export interface FallbackFailure {
  readonly providerId: string;
  readonly error: AppError;
}

export interface FallbackSuccess<T> {
  readonly providerId: string;
  readonly value: T;
  /** Providers that failed before this one succeeded. */
  readonly failures: readonly FallbackFailure[];
}

/**
 * Whether the next provider should be tried after this error.
 * Auth, quota, exhausted transient failures and bad output move on.
 * Policy refusals and offline errors do not: the user must decide, or wait.
 */
export function shouldFallBack(error: AppError): boolean {
  const kind = error.details?.["kind"];
  return kind === "auth" || kind === "quota" || kind === "transient" || kind === "bad_output";
}

export async function runWithFallback<T>(
  chain: readonly ProviderAdapter[],
  run: (adapter: ProviderAdapter) => Promise<T>,
): Promise<FallbackSuccess<T>> {
  if (chain.length === 0) {
    throw new AppError({
      code: "provider.none_available",
      category: "validation",
      messageKey: "error.provider.noneAvailable",
      message: "No provider is configured for this capability",
      recoverable: true,
    });
  }

  const failures: FallbackFailure[] = [];
  for (const adapter of chain) {
    try {
      const value = await run(adapter);
      return { providerId: adapter.manifest.id, value, failures };
    } catch (cause) {
      const error = toAppError(cause);
      failures.push({ providerId: adapter.manifest.id, error });
      if (!shouldFallBack(error)) {
        throw error;
      }
    }
  }

  const last = failures[failures.length - 1];
  throw new AppError({
    code: "provider.all_failed",
    category: last?.error.category ?? "unknown",
    messageKey: "error.provider.allFailed",
    message: "Every configured provider failed",
    recoverable: true,
    details: {
      retryable: false,
      attempts: failures.map((failure) => ({
        providerId: failure.providerId,
        code: failure.error.code,
      })),
    },
    cause: last?.error,
  });
}

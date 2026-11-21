import { AppError, OFFLINE_ERROR_CODE } from "@avs/core";
import type { ErrorCategory } from "@avs/core";

/**
 * Normalized provider failures. Adapters translate whatever the provider
 * returns into one of these kinds, so the rest of the app never needs to
 * know provider-specific error formats.
 */
export const PROVIDER_ERROR_KINDS = [
  "auth",
  "quota",
  "policy",
  "transient",
  "bad_output",
  "cancelled",
] as const;

export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

const CATEGORY_BY_KIND: Record<ProviderErrorKind, ErrorCategory> = {
  auth: "auth",
  quota: "quota",
  policy: "policy",
  transient: "network",
  bad_output: "media",
  cancelled: "unknown",
};

const RETRYABLE_KINDS: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  "transient",
  "bad_output",
]);

export interface ProviderErrorInit {
  readonly providerId: string;
  readonly message?: string;
  readonly httpStatus?: number;
  readonly cause?: unknown;
}

export function providerError(kind: ProviderErrorKind, init: ProviderErrorInit): AppError {
  return new AppError({
    code: `provider.${kind}`,
    category: CATEGORY_BY_KIND[kind],
    messageKey: `error.provider.${kind}`,
    message: init.message ?? `Provider ${init.providerId} failed: ${kind}`,
    recoverable: kind !== "cancelled",
    params: { provider: init.providerId },
    details: {
      kind,
      retryable: RETRYABLE_KINDS.has(kind),
      providerId: init.providerId,
      ...(init.httpStatus === undefined ? {} : { httpStatus: init.httpStatus }),
    },
    cause: init.cause,
  });
}

/** No internet. Never retried with backoff; the job queue pauses until the network returns. */
export function offlineError(providerId: string, cause?: unknown): AppError {
  return new AppError({
    code: OFFLINE_ERROR_CODE,
    category: "network",
    messageKey: "error.network.offline",
    message: "No internet connection",
    recoverable: true,
    details: { retryable: false, providerId },
    cause,
  });
}

/**
 * Maps an HTTP status to a provider error kind, or null when the caller
 * must decide. 429 is treated as transient so it is retried with backoff;
 * if it keeps failing the fallback chain moves on to the next provider.
 */
export function classifyHttpStatus(status: number): ProviderErrorKind | null {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 408 || status === 429) return "transient";
  if (status >= 500 && status <= 599) return "transient";
  return null;
}

function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Turns a failed fetch (or any thrown value) into a normalized error. */
export function normalizeTransportError(
  providerId: string,
  cause: unknown,
  isOnline: () => boolean = defaultIsOnline,
): AppError {
  if (cause instanceof AppError) {
    return cause;
  }
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return providerError("cancelled", { providerId, cause });
  }
  if (!isOnline()) {
    return offlineError(providerId, cause);
  }
  return providerError("transient", { providerId, cause });
}

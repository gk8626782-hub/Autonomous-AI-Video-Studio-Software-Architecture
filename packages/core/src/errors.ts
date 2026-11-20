/**
 * Application error taxonomy.
 *
 * User-facing text is never stored here. Each error carries an i18n key
 * (messageKey) that the UI translates to Hindi or English. The plain
 * "message" is an English developer message used for logs.
 */
export const ERROR_CATEGORIES = [
  "auth",
  "quota",
  "policy",
  "network",
  "storage",
  "media",
  "render",
  "validation",
  "unknown",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export type MessageParams = Readonly<Record<string, string | number>>;

export interface AppErrorInit {
  /** Stable machine-readable code, for example "storage.quota_exceeded". */
  readonly code: string;
  readonly category: ErrorCategory;
  /** i18n key for the user-facing message. */
  readonly messageKey: string;
  /** English developer message for logs. Must not contain secrets. */
  readonly message: string;
  /** Whether the user can recover by retrying or taking an action. */
  readonly recoverable: boolean;
  readonly params?: MessageParams;
  /** Extra diagnostic data. Must never contain API keys or user content. */
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly messageKey: string;
  readonly recoverable: boolean;
  readonly params: MessageParams | undefined;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(init: AppErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "AppError";
    this.code = init.code;
    this.category = init.category;
    this.messageKey = init.messageKey;
    this.recoverable = init.recoverable;
    this.params = init.params;
    this.details = init.details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Normalizes any thrown value into an AppError so callers handle one shape. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) {
    return value;
  }
  return new AppError({
    code: "unknown.unhandled",
    category: "unknown",
    messageKey: "error.unknown",
    message: "Unhandled error",
    recoverable: true,
    cause: value,
  });
}

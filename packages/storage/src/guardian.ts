import { AppError } from "@avs/core";

export type StorageLevel = "ok" | "warn" | "block";

export interface StorageAssessment {
  readonly level: StorageLevel;
  readonly neededBytes: number;
  /** Free space after the safety margin. */
  readonly availableBytes: number;
  readonly shortfallBytes: number;
}

export interface AssessOptions {
  readonly neededBytes: number;
  readonly quotaBytes: number;
  readonly usageBytes: number;
  /** Fraction of free space kept in reserve. Default 0.1. */
  readonly safetyMargin?: number;
  /** Warn when the need exceeds this fraction of available space. Default 0.8. */
  readonly warnRatio?: number;
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError({
      code: "validation.invalid_storage_input",
      category: "validation",
      messageKey: "error.validation.storageInput",
      message: `${name} must be a non-negative number`,
      recoverable: false,
      details: { field: name },
    });
  }
}

/**
 * Decides whether the planned work fits. The browser reports a quota, not
 * the real free disk space, so a safety margin is always applied.
 */
export function assessStorage(options: AssessOptions): StorageAssessment {
  assertNonNegative("neededBytes", options.neededBytes);
  assertNonNegative("quotaBytes", options.quotaBytes);
  assertNonNegative("usageBytes", options.usageBytes);

  const safetyMargin = options.safetyMargin ?? 0.1;
  const warnRatio = options.warnRatio ?? 0.8;

  const free = Math.max(0, options.quotaBytes - options.usageBytes);
  const availableBytes = Math.floor(free * (1 - safetyMargin));
  const neededBytes = options.neededBytes;
  const shortfallBytes = Math.max(0, neededBytes - availableBytes);

  let level: StorageLevel = "ok";
  if (neededBytes > availableBytes) {
    level = "block";
  } else if (neededBytes > availableBytes * warnRatio) {
    level = "warn";
  }

  return { level, neededBytes, availableBytes, shortfallBytes };
}

export interface RenderEstimateInput {
  /** Total size of all generated clips planned for the project. */
  readonly plannedClipBytes: number;
  readonly expectedFinalBytes: number;
  /** Temporary files as a multiple of the final size. Default 2. */
  readonly tempFactor?: number;
}

/** Planned clips + temporary files (about 2x final) + the exported file. */
export function estimateRequiredBytes(input: RenderEstimateInput): number {
  assertNonNegative("plannedClipBytes", input.plannedClipBytes);
  assertNonNegative("expectedFinalBytes", input.expectedFinalBytes);
  const tempFactor = input.tempFactor ?? 2;
  assertNonNegative("tempFactor", tempFactor);

  return input.plannedClipBytes + input.expectedFinalBytes * tempFactor + input.expectedFinalBytes;
}

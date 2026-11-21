/** The parts of the browser StorageManager that we use. Injectable for tests. */
export interface StorageManagerLike {
  estimate(): Promise<{ quota?: number | undefined; usage?: number | undefined }>;
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

export interface StorageEstimateBytes {
  readonly quotaBytes: number;
  readonly usageBytes: number;
}

export type PersistenceResult = "granted" | "denied" | "unsupported";

function defaultManager(): StorageManagerLike | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.storage;
}

/** Returns null when the browser cannot report an estimate. Callers must treat null as unknown. */
export async function readStorageEstimate(
  manager: StorageManagerLike | undefined = defaultManager(),
): Promise<StorageEstimateBytes | null> {
  if (manager === undefined) {
    return null;
  }
  try {
    const estimate = await manager.estimate();
    if (typeof estimate.quota !== "number" || typeof estimate.usage !== "number") {
      return null;
    }
    return { quotaBytes: estimate.quota, usageBytes: estimate.usage };
  } catch {
    return null;
  }
}

/**
 * Asks the browser to keep our storage from being evicted. Without this,
 * browsers (especially Safari) may delete site data after a period of disuse.
 */
export async function requestPersistence(
  manager: StorageManagerLike | undefined = defaultManager(),
): Promise<PersistenceResult> {
  if (manager === undefined || manager.persist === undefined) {
    return "unsupported";
  }
  try {
    if (manager.persisted !== undefined && (await manager.persisted())) {
      return "granted";
    }
    return (await manager.persist()) ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

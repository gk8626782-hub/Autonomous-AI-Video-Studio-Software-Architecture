import type { HashKind } from "./types";

/** Files up to this size get a full SHA-256. Larger files get a sampled hash. */
export const FULL_HASH_MAX_BYTES = 64 * 1024 * 1024;
export const SAMPLE_BYTES = 8 * 1024 * 1024;

export interface Fingerprint {
  readonly sha256: string;
  readonly hashKind: HashKind;
}

export interface FingerprintOptions {
  readonly fullHashMaxBytes?: number;
  readonly sampleBytes?: number;
}

async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Small files are hashed completely. For large files the hash covers the
 * first, middle and last sample plus the exact size. That catches truncation
 * and most corruption cheaply, but not a change inside an unsampled region;
 * the "partial" kind records that limit.
 */
export async function computeFingerprint(
  blob: Blob,
  options: FingerprintOptions = {},
): Promise<Fingerprint> {
  const fullHashMaxBytes = options.fullHashMaxBytes ?? FULL_HASH_MAX_BYTES;
  const sampleBytes = options.sampleBytes ?? SAMPLE_BYTES;

  if (blob.size <= fullHashMaxBytes) {
    return { sha256: await sha256Hex(await blob.arrayBuffer()), hashKind: "full" };
  }

  const middleStart = Math.floor((blob.size - sampleBytes) / 2);
  const samples = await Promise.all([
    blob.slice(0, sampleBytes).arrayBuffer(),
    blob.slice(middleStart, middleStart + sampleBytes).arrayBuffer(),
    blob.slice(blob.size - sampleBytes).arrayBuffer(),
  ]);

  const sizeBuffer = new ArrayBuffer(8);
  new DataView(sizeBuffer).setBigUint64(0, BigInt(blob.size));

  const parts = [...samples, sizeBuffer];
  let total = 0;
  for (const part of parts) {
    total += part.byteLength;
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }

  return { sha256: await sha256Hex(joined), hashKind: "partial" };
}

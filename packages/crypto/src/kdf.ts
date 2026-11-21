import { asBufferSource } from "./bytes";

export const KDF_NAME = "PBKDF2-SHA256";
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
export const MAX_PBKDF2_ITERATIONS = 10_000_000;
export const SALT_BYTES = 16;

export interface KdfParams {
  readonly iterations: number;
  readonly salt: Uint8Array;
}

/** NFKC keeps the same passphrase identical across keyboards and Unicode forms (important for Devanagari). */
export function normalizePassphrase(passphrase: string): string {
  return passphrase.normalize("NFKC");
}

/**
 * Derives the key-encryption key (KEK) from a passphrase.
 * The KEK is non-extractable and can only wrap and unwrap the data key.
 */
export async function deriveKeyEncryptionKey(
  passphrase: string,
  params: KdfParams,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    asBufferSource(new TextEncoder().encode(normalizePassphrase(passphrase))),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asBufferSource(params.salt),
      iterations: params.iterations,
    },
    material,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

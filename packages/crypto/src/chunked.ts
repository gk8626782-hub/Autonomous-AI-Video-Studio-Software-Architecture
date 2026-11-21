import { AppError } from "@avs/core";
import { asBufferSource, concatBytes, randomBytes } from "./bytes";

/** Default chunk size for encrypting large files (used by Drive sync). */
export const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;

const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface ChunkContext {
  readonly fileId: string;
  readonly version: number;
  readonly index: number;
}

export interface EncryptOptions {
  readonly fileId: string;
  readonly version: number;
  readonly chunkBytes?: number;
}

export interface DecryptOptions {
  readonly fileId: string;
  readonly version: number;
}

/**
 * The authenticated data binds each chunk to its file, version and position,
 * so chunks cannot be swapped, reordered or moved to another file unnoticed.
 * Detecting a dropped trailing chunk is the job of the manifest (chunk count),
 * which the sync package stores next to the chunks.
 */
function chunkAad(ctx: ChunkContext): Uint8Array {
  return new TextEncoder().encode(`avs-chunk:v1:${ctx.fileId}:${ctx.version}:${ctx.index}`);
}

/** Output layout: 12-byte random IV followed by ciphertext and tag. */
export async function encryptChunk(
  key: CryptoKey,
  plaintext: Uint8Array,
  ctx: ChunkContext,
): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asBufferSource(iv),
      additionalData: asBufferSource(chunkAad(ctx)),
    },
    key,
    asBufferSource(plaintext),
  );
  return concatBytes(iv, new Uint8Array(ct));
}

export async function decryptChunk(
  key: CryptoKey,
  sealed: Uint8Array,
  ctx: ChunkContext,
): Promise<Uint8Array> {
  if (sealed.length < IV_BYTES + TAG_BYTES) {
    throw authFailed(ctx, undefined);
  }

  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asBufferSource(sealed.subarray(0, IV_BYTES)),
        additionalData: asBufferSource(chunkAad(ctx)),
      },
      key,
      asBufferSource(sealed.subarray(IV_BYTES)),
    );
    return new Uint8Array(plain);
  } catch (cause) {
    throw authFailed(ctx, cause);
  }
}

/** Splits data into chunks and encrypts each one. Empty data yields one empty chunk. */
export async function encryptBytes(
  key: CryptoKey,
  data: Uint8Array,
  options: EncryptOptions,
): Promise<Uint8Array[]> {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new AppError({
      code: "validation.invalid_chunk_size",
      category: "validation",
      messageKey: "error.validation.chunkSize",
      message: "Chunk size must be a positive integer",
      recoverable: false,
    });
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;
  let index = 0;
  do {
    const slice = data.subarray(offset, offset + chunkBytes);
    chunks.push(
      await encryptChunk(key, slice, { fileId: options.fileId, version: options.version, index }),
    );
    offset += chunkBytes;
    index += 1;
  } while (offset < data.length);

  return chunks;
}

export async function decryptChunks(
  key: CryptoKey,
  chunks: readonly Uint8Array[],
  options: DecryptOptions,
): Promise<Uint8Array> {
  const plain: Uint8Array[] = [];
  for (const [index, chunk] of chunks.entries()) {
    plain.push(
      await decryptChunk(key, chunk, { fileId: options.fileId, version: options.version, index }),
    );
  }
  return concatBytes(...plain);
}

function authFailed(ctx: ChunkContext, cause: unknown): AppError {
  return new AppError({
    code: "storage.chunk_authentication_failed",
    category: "storage",
    messageKey: "error.storage.chunkAuthentication",
    message: "Encrypted chunk failed authentication",
    recoverable: false,
    details: { fileId: ctx.fileId, index: ctx.index },
    cause,
  });
}

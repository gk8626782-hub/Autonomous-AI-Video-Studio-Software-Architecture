import { beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { decryptChunk, decryptChunks, encryptBytes, encryptChunk } from "./chunked";

let key: CryptoKey;

beforeAll(async () => {
  key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
});

function sampleBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = (i * 7 + 3) % 256;
  }
  return out;
}

const ctx = { fileId: "file-1", version: 1 };

describe("chunked encryption", () => {
  it("round-trips data across several chunks", async () => {
    const data = sampleBytes(25);
    const chunks = await encryptBytes(key, data, { ...ctx, chunkBytes: 10 });

    expect(chunks).toHaveLength(3);
    expect(await decryptChunks(key, chunks, ctx)).toEqual(data);
  });

  it("round-trips empty data as one chunk", async () => {
    const chunks = await encryptBytes(key, new Uint8Array(0), ctx);
    expect(chunks).toHaveLength(1);
    expect((await decryptChunks(key, chunks, ctx)).length).toBe(0);
  });

  it("does not leak plaintext and uses a fresh IV per chunk", async () => {
    const data = new TextEncoder().encode("secret-media-bytes");
    const [a] = await encryptBytes(key, data, ctx);
    const [b] = await encryptBytes(key, data, ctx);

    expect(new TextDecoder().decode(a!)).not.toContain("secret-media-bytes");
    expect(a).not.toEqual(b);
  });

  it("detects a modified chunk", async () => {
    const [chunk] = await encryptBytes(key, sampleBytes(20), ctx);
    const tampered = new Uint8Array(chunk!);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1]! + 1) % 256;

    await expect(decryptChunk(key, tampered, { ...ctx, index: 0 })).rejects.toBeInstanceOf(AppError);
  });

  it("detects reordered chunks", async () => {
    const chunks = await encryptBytes(key, sampleBytes(30), { ...ctx, chunkBytes: 10 });
    const swapped = [chunks[1]!, chunks[0]!, chunks[2]!];

    await expect(decryptChunks(key, swapped, ctx)).rejects.toMatchObject({
      code: "storage.chunk_authentication_failed",
    });
  });

  it("detects chunks moved to another file or version", async () => {
    const chunks = await encryptBytes(key, sampleBytes(10), ctx);

    await expect(decryptChunks(key, chunks, { fileId: "file-2", version: 1 })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(decryptChunks(key, chunks, { fileId: "file-1", version: 2 })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("rejects chunks that are too short", async () => {
    await expect(decryptChunk(key, new Uint8Array(5), { ...ctx, index: 0 })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("rejects an invalid chunk size", async () => {
    await expect(encryptBytes(key, sampleBytes(5), { ...ctx, chunkBytes: 0 })).rejects.toMatchObject({
      code: "validation.invalid_chunk_size",
    });
  });

  it("encrypts a single chunk with an explicit position", async () => {
    const data = sampleBytes(8);
    const sealed = await encryptChunk(key, data, { ...ctx, index: 4 });
    expect(await decryptChunk(key, sealed, { ...ctx, index: 4 })).toEqual(data);
  });
});

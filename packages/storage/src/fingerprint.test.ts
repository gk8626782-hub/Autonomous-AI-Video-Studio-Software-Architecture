import { describe, expect, it } from "vitest";
import { computeFingerprint } from "./fingerprint";

const HELLO_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const PARTIAL = { fullHashMaxBytes: 16, sampleBytes: 4 };

function blobWithByte(size: number, index: number): Blob {
  const bytes = new Uint8Array(size);
  bytes[index] = 1;
  return new Blob([bytes]);
}

describe("computeFingerprint", () => {
  it("hashes small files completely", async () => {
    const fingerprint = await computeFingerprint(new Blob(["hello"]));
    expect(fingerprint).toEqual({ sha256: HELLO_SHA256, hashKind: "full" });
  });

  it("samples large files", async () => {
    const fingerprint = await computeFingerprint(blobWithByte(40, 0), PARTIAL);
    expect(fingerprint.hashKind).toBe("partial");
    expect(fingerprint.sha256).toHaveLength(64);
  });

  it("is deterministic for identical content", async () => {
    const a = await computeFingerprint(blobWithByte(40, 10), PARTIAL);
    const b = await computeFingerprint(blobWithByte(40, 10), PARTIAL);
    expect(a).toEqual(b);
  });

  it("detects changes in the sampled head, middle and tail", async () => {
    const base = await computeFingerprint(blobWithByte(40, 10), PARTIAL);

    for (const index of [0, 19, 38]) {
      const changed = await computeFingerprint(blobWithByte(40, index), PARTIAL);
      expect(changed.sha256).not.toBe(base.sha256);
    }
  });

  it("does not see changes in unsampled regions, which is why it is marked partial", async () => {
    const a = await computeFingerprint(blobWithByte(40, 9), PARTIAL);
    const b = await computeFingerprint(blobWithByte(40, 10), PARTIAL);
    expect(a.sha256).toBe(b.sha256);
  });

  it("includes the size in the hash", async () => {
    const a = await computeFingerprint(new Blob([new Uint8Array(40)]), PARTIAL);
    const b = await computeFingerprint(new Blob([new Uint8Array(41)]), PARTIAL);
    expect(a.sha256).not.toBe(b.sha256);
  });
});

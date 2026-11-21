import { describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import {
  createVault,
  listSecretNames,
  openSecret,
  parseVault,
  removeSecret,
  sealSecret,
  serializeVault,
  unlockVault,
} from "./vault";

const FAST = { iterations: 1_000 };
const PASSPHRASE = "correct horse battery";

describe("vault", () => {
  it("creates a vault, seals a secret and reopens it after unlocking", async () => {
    const { data, key } = await createVault(PASSPHRASE, FAST);
    const sealed = await sealSecret(data, key, "gemini", "sk-test-123");

    expect(JSON.stringify(sealed)).not.toContain("sk-test-123");

    const unlocked = await unlockVault(sealed, PASSPHRASE);
    expect(await openSecret(sealed, unlocked, "gemini")).toBe("sk-test-123");
    expect(await openSecret(sealed, unlocked, "missing")).toBeUndefined();
  });

  it("keeps the session key non-extractable", async () => {
    const { key } = await createVault(PASSPHRASE, FAST);
    expect(key.extractable).toBe(false);
  });

  it("rejects a wrong passphrase", async () => {
    const { data } = await createVault(PASSPHRASE, FAST);
    await expect(unlockVault(data, "another passphrase")).rejects.toMatchObject({
      code: "auth.invalid_passphrase",
    });
  });

  it("rejects a short passphrase", async () => {
    await expect(createVault("short", FAST)).rejects.toMatchObject({
      code: "validation.invalid_passphrase",
    });
  });

  it("treats equivalent Unicode forms of a passphrase as identical", async () => {
    const composed = "caf\u00e9-passphrase";
    const decomposed = "cafe\u0301-passphrase";
    const { data } = await createVault(composed, FAST);
    await expect(unlockVault(data, decomposed)).resolves.toBeDefined();
  });

  it("binds each secret to its name", async () => {
    const { data, key } = await createVault(PASSPHRASE, FAST);
    const sealed = await sealSecret(data, key, "gemini", "sk-test-123");
    const moved = { ...sealed, secrets: { other: sealed.secrets["gemini"]! } };

    await expect(openSecret(moved, key, "other")).rejects.toBeInstanceOf(AppError);
  });

  it("validates secret names and values", async () => {
    const { data, key } = await createVault(PASSPHRASE, FAST);
    await expect(sealSecret(data, key, "bad name", "x")).rejects.toMatchObject({
      code: "validation.invalid_secret_name",
    });
    await expect(sealSecret(data, key, "ok", "")).rejects.toMatchObject({
      code: "validation.invalid_secret_value",
    });
  });

  it("lists and removes secrets without mutating the input", async () => {
    const { data, key } = await createVault(PASSPHRASE, FAST);
    const withA = await sealSecret(data, key, "a", "1");
    const withAB = await sealSecret(withA, key, "b", "2");

    expect(listSecretNames(withAB)).toEqual(["a", "b"]);
    expect(listSecretNames(removeSecret(withAB, "a"))).toEqual(["b"]);
    expect(listSecretNames(withAB)).toEqual(["a", "b"]);
    expect(listSecretNames(data)).toEqual([]);
  });

  it("serializes and parses a vault", async () => {
    const { data, key } = await createVault(PASSPHRASE, FAST);
    const sealed = await sealSecret(data, key, "gemini", "sk-test-123");

    expect(parseVault(serializeVault(sealed))).toEqual(sealed);
  });

  it("rejects damaged vault bytes", () => {
    const garbage = new TextEncoder().encode("not json");
    const wrongShape = new TextEncoder().encode(JSON.stringify({ version: 1 }));

    expect(() => parseVault(garbage)).toThrowError(/damaged/);
    expect(() => parseVault(wrongShape)).toThrowError(/damaged/);
  });
});

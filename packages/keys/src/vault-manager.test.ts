import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioDatabase, VaultStore } from "@avs/storage";
import { VaultManager } from "./vault-manager";

let db: StudioDatabase;
let store: VaultStore;

const PASSPHRASE = "correct horse battery";
const make = (): VaultManager => new VaultManager(store, { iterations: 1_000 });

beforeEach(() => {
  db = new StudioDatabase(`avs-keys-${Math.random().toString(36).slice(2)}`);
  store = new VaultStore(db);
});

afterEach(async () => {
  await db.delete();
});

describe("VaultManager", () => {
  it("starts without a vault", async () => {
    const manager = make();
    expect(await manager.state()).toBe("none");
    expect(await manager.secretNames()).toEqual([]);
  });

  it("creates an unlocked vault that a new session finds locked", async () => {
    const manager = make();
    await manager.create(PASSPHRASE);

    expect(await manager.state()).toBe("unlocked");
    expect(await store.exists()).toBe(true);
    expect(await make().state()).toBe("locked");
  });

  it("refuses to create a second vault", async () => {
    const manager = make();
    await manager.create(PASSPHRASE);
    await expect(make().create(PASSPHRASE)).rejects.toMatchObject({ code: "keys.vault_exists" });
  });

  it("rejects a short passphrase", async () => {
    await expect(make().create("short")).rejects.toMatchObject({ code: "validation.invalid_passphrase" });
    expect(await store.exists()).toBe(false);
  });

  it("unlocks with the right passphrase and stays locked after a wrong one", async () => {
    await make().create(PASSPHRASE);

    const manager = make();
    await expect(manager.unlock("another passphrase")).rejects.toMatchObject({ code: "auth.invalid_passphrase" });
    expect(await manager.state()).toBe("locked");

    await manager.unlock(PASSPHRASE);
    expect(await manager.state()).toBe("unlocked");
  });

  it("fails to unlock when there is no vault", async () => {
    await expect(make().unlock(PASSPHRASE)).rejects.toMatchObject({ code: "keys.vault_missing" });
  });

  it("stores keys encrypted and returns them after unlocking in a new session", async () => {
    const first = make();
    await first.create(PASSPHRASE);
    await first.setSecret("apikey.gemini", "sk-secret-123");

    const stored = new TextDecoder().decode((await store.load()) ?? new Uint8Array());
    expect(stored).not.toContain("sk-secret-123");
    expect(stored).toContain("apikey.gemini");

    const second = make();
    await second.unlock(PASSPHRASE);
    expect(await second.getSecret("apikey.gemini")).toBe("sk-secret-123");
    expect(await second.getSecret("apikey.openai")).toBeUndefined();
  });

  it("lists secret names without unlocking", async () => {
    const first = make();
    await first.create(PASSPHRASE);
    await first.setSecret("apikey.openai", "k1");
    await first.setSecret("apikey.gemini", "k2");

    expect(await make().secretNames()).toEqual(["apikey.gemini", "apikey.openai"]);
  });

  it("removes a key", async () => {
    const manager = make();
    await manager.create(PASSPHRASE);
    await manager.setSecret("apikey.gemini", "k");
    await manager.removeSecret("apikey.gemini");

    expect(await manager.secretNames()).toEqual([]);
    expect(await make().secretNames()).toEqual([]);
  });

  it("needs the vault to be unlocked to read or change keys", async () => {
    const manager = make();
    await manager.create(PASSPHRASE);
    await manager.setSecret("apikey.gemini", "k");
    manager.lock();

    expect(await manager.state()).toBe("locked");
    await expect(manager.getSecret("apikey.gemini")).rejects.toMatchObject({ code: "keys.vault_locked" });
    await expect(manager.setSecret("apikey.openai", "k")).rejects.toMatchObject({ code: "keys.vault_locked" });
    await expect(manager.removeSecret("apikey.gemini")).rejects.toMatchObject({ code: "keys.vault_locked" });
  });

  it("deletes everything on reset and allows a new vault", async () => {
    const manager = make();
    await manager.create(PASSPHRASE);
    await manager.setSecret("apikey.gemini", "k");

    await manager.reset();
    expect(await manager.state()).toBe("none");
    expect(await store.exists()).toBe(false);

    await manager.create("a brand new passphrase");
    expect(await manager.secretNames()).toEqual([]);
  });
});

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioDatabase, VaultStore } from "./index";

let db: StudioDatabase;
let store: VaultStore;

beforeEach(() => {
  db = new StudioDatabase(`avs-vault-${Math.random().toString(36).slice(2)}`);
  store = new VaultStore(db);
});

afterEach(async () => {
  await db.delete();
});

describe("VaultStore", () => {
  it("starts empty", async () => {
    expect(await store.exists()).toBe(false);
    expect(await store.load()).toBeNull();
  });

  it("saves and loads bytes and bumps the version", async () => {
    await store.save(new Uint8Array([1, 2, 3]));
    expect(Array.from((await store.load())!)).toEqual([1, 2, 3]);
    expect((await db.vault.get("main"))?.version).toBe(1);

    await store.save(new Uint8Array([9]));
    expect(Array.from((await store.load())!)).toEqual([9]);
    expect((await db.vault.get("main"))?.version).toBe(2);
  });

  it("clears the vault", async () => {
    await store.save(new Uint8Array([1]));
    await store.clear();
    expect(await store.exists()).toBe(false);
  });
});

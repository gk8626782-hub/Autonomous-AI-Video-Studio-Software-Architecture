import type { StudioDatabase } from "./db";

export const MAIN_VAULT_ID = "main";

/**
 * Stores the opaque, already encrypted vault bytes produced by the crypto
 * package. This class never sees a passphrase or a key.
 */
export class VaultStore {
  constructor(private readonly db: StudioDatabase) {}

  async load(): Promise<Uint8Array | null> {
    const record = await this.db.vault.get(MAIN_VAULT_ID);
    return record?.payload ?? null;
  }

  async exists(): Promise<boolean> {
    return (await this.db.vault.get(MAIN_VAULT_ID)) !== undefined;
  }

  async save(payload: Uint8Array): Promise<void> {
    const existing = await this.db.vault.get(MAIN_VAULT_ID);
    await this.db.vault.put({
      id: MAIN_VAULT_ID,
      version: (existing?.version ?? 0) + 1,
      payload,
    });
  }

  async clear(): Promise<void> {
    await this.db.vault.delete(MAIN_VAULT_ID);
  }
}

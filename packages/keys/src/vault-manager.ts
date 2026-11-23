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
} from "@avs/crypto";
import type { VaultData } from "@avs/crypto";
import type { VaultStore } from "@avs/storage";

export type VaultState = "none" | "locked" | "unlocked";

const ERRORS = {
  vault_exists: { key: "vaultExists", category: "validation", message: "A key vault already exists" },
  vault_locked: { key: "vaultLocked", category: "auth", message: "The key vault is locked" },
  vault_missing: { key: "vaultMissing", category: "validation", message: "There is no key vault yet" },
} as const;

function keysError(code: keyof typeof ERRORS): AppError {
  const info = ERRORS[code];
  return new AppError({
    code: `keys.${code}`,
    category: info.category,
    messageKey: `error.keys.${info.key}`,
    message: info.message,
    recoverable: true,
  });
}

export interface VaultManagerOptions {
  /** PBKDF2 iterations for a new vault. Tests use a small number to stay fast. */
  readonly iterations?: number;
}

/**
 * Owns the key vault for the current session. The unlocked data key lives only
 * in memory and is dropped on lock() or when the page is closed.
 * Secret names are not encrypted, so they can be listed without unlocking.
 */
export class VaultManager {
  private data: VaultData | null = null;
  private key: CryptoKey | null = null;
  private readonly iterations: number | undefined;

  constructor(
    private readonly store: VaultStore,
    options: VaultManagerOptions = {},
  ) {
    this.iterations = options.iterations;
  }

  async state(): Promise<VaultState> {
    if (this.data !== null && this.key !== null) {
      return "unlocked";
    }
    return (await this.store.exists()) ? "locked" : "none";
  }

  /** Creates the vault and leaves it unlocked. */
  async create(passphrase: string): Promise<void> {
    if (await this.store.exists()) {
      throw keysError("vault_exists");
    }
    const created = await createVault(passphrase, { iterations: this.iterations });
    await this.store.save(serializeVault(created.data));
    this.data = created.data;
    this.key = created.key;
  }

  /** Opens the vault. A wrong passphrase throws and leaves it locked. */
  async unlock(passphrase: string): Promise<void> {
    const bytes = await this.store.load();
    if (bytes === null) {
      throw keysError("vault_missing");
    }
    const data = parseVault(bytes);
    const key = await unlockVault(data, passphrase);
    this.data = data;
    this.key = key;
  }

  lock(): void {
    this.data = null;
    this.key = null;
  }

  async secretNames(): Promise<string[]> {
    if (this.data !== null) {
      return listSecretNames(this.data);
    }
    const bytes = await this.store.load();
    return bytes === null ? [] : listSecretNames(parseVault(bytes));
  }

  async setSecret(name: string, value: string): Promise<void> {
    const { data, key } = this.requireUnlocked();
    const next = await sealSecret(data, key, name, value);
    await this.store.save(serializeVault(next));
    this.data = next;
  }

  async removeSecret(name: string): Promise<void> {
    const { data } = this.requireUnlocked();
    const next = removeSecret(data, name);
    await this.store.save(serializeVault(next));
    this.data = next;
  }

  /** Reads one secret. Only call it right before the key is needed. */
  async getSecret(name: string): Promise<string | undefined> {
    const { data, key } = this.requireUnlocked();
    return openSecret(data, key, name);
  }

  /** Deletes the vault and every secret in it. Used when the passphrase is forgotten. */
  async reset(): Promise<void> {
    await this.store.clear();
    this.lock();
  }

  private requireUnlocked(): { data: VaultData; key: CryptoKey } {
    if (this.data === null || this.key === null) {
      throw keysError("vault_locked");
    }
    return { data: this.data, key: this.key };
  }
}

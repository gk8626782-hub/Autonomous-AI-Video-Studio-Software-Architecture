import { AppError } from "@avs/core";
import { asBufferSource, fromBase64, randomBytes, toBase64 } from "./bytes";
import {
  DEFAULT_PBKDF2_ITERATIONS,
  KDF_NAME,
  MAX_PBKDF2_ITERATIONS,
  SALT_BYTES,
  deriveKeyEncryptionKey,
} from "./kdf";

export const VAULT_FORMAT_VERSION = 1;
export const MIN_PASSPHRASE_LENGTH = 8;

const SECRET_IV_BYTES = 12;
const SECRET_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export interface SealedSecret {
  readonly iv: string;
  readonly ct: string;
}

/**
 * Serializable vault. A random data key (DEK) encrypts the secrets.
 * The DEK is wrapped with a key derived from the user's passphrase.
 * Nothing in here is readable without the passphrase.
 */
export interface VaultData {
  readonly version: typeof VAULT_FORMAT_VERSION;
  readonly kdf: {
    readonly name: typeof KDF_NAME;
    readonly iterations: number;
    readonly salt: string;
  };
  readonly wrappedKey: string;
  readonly secrets: Readonly<Record<string, SealedSecret>>;
}

export interface CreateVaultOptions {
  readonly iterations?: number;
}

function validation(field: string, message: string): AppError {
  return new AppError({
    code: `validation.invalid_${field}`,
    category: "validation",
    messageKey: `error.validation.${field}`,
    message,
    recoverable: true,
    details: { field },
  });
}

function assertSecretName(name: string): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw validation("secret_name", "Secret name must be 1-64 characters: letters, digits, . _ : -");
  }
}

function secretAad(name: string): Uint8Array {
  return new TextEncoder().encode(`avs-vault-secret:v${VAULT_FORMAT_VERSION}:${name}`);
}

/**
 * Creates a new vault. The returned key is the unlocked, non-extractable
 * data key for the current session.
 */
export async function createVault(
  passphrase: string,
  options: CreateVaultOptions = {},
): Promise<{ data: VaultData; key: CryptoKey }> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw validation("passphrase", `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }

  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveKeyEncryptionKey(passphrase, { iterations, salt });

  // The generated key is extractable only so it can be wrapped once.
  const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", generated, kek, "AES-KW"));

  const data: VaultData = {
    version: VAULT_FORMAT_VERSION,
    kdf: { name: KDF_NAME, iterations, salt: toBase64(salt) },
    wrappedKey: toBase64(wrapped),
    secrets: {},
  };

  // The session key is unwrapped as non-extractable; raw bytes are never exposed.
  const key = await unlockVault(data, passphrase);
  return { data, key };
}

/** Unwraps the data key. A wrong passphrase fails here. */
export async function unlockVault(data: VaultData, passphrase: string): Promise<CryptoKey> {
  try {
    const kek = await deriveKeyEncryptionKey(passphrase, {
      iterations: data.kdf.iterations,
      salt: fromBase64(data.kdf.salt),
    });
    return await crypto.subtle.unwrapKey(
      "raw",
      asBufferSource(fromBase64(data.wrappedKey)),
      kek,
      "AES-KW",
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  } catch (cause) {
    throw new AppError({
      code: "auth.invalid_passphrase",
      category: "auth",
      messageKey: "error.auth.invalidPassphrase",
      message: "Passphrase is incorrect or the vault is damaged",
      recoverable: true,
      cause,
    });
  }
}

/** Returns a new vault with the secret added or replaced. The input is not modified. */
export async function sealSecret(
  data: VaultData,
  key: CryptoKey,
  name: string,
  plaintext: string,
): Promise<VaultData> {
  assertSecretName(name);
  if (plaintext.length === 0) {
    throw validation("secret_value", "Secret value must not be empty");
  }

  const iv = randomBytes(SECRET_IV_BYTES);
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asBufferSource(iv),
      additionalData: asBufferSource(secretAad(name)),
    },
    key,
    asBufferSource(new TextEncoder().encode(plaintext)),
  );

  return {
    ...data,
    secrets: {
      ...data.secrets,
      [name]: { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) },
    },
  };
}

/** Decrypts a secret. Returns undefined when the name is not stored. */
export async function openSecret(
  data: VaultData,
  key: CryptoKey,
  name: string,
): Promise<string | undefined> {
  const sealed = data.secrets[name];
  if (sealed === undefined) {
    return undefined;
  }

  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asBufferSource(fromBase64(sealed.iv)),
        additionalData: asBufferSource(secretAad(name)),
      },
      key,
      asBufferSource(fromBase64(sealed.ct)),
    );
    return new TextDecoder().decode(plain);
  } catch (cause) {
    throw new AppError({
      code: "auth.vault_decrypt_failed",
      category: "auth",
      messageKey: "error.auth.vaultDecryptFailed",
      message: "Could not decrypt the stored secret",
      recoverable: false,
      details: { name },
      cause,
    });
  }
}

export function removeSecret(data: VaultData, name: string): VaultData {
  const { [name]: _removed, ...rest } = data.secrets;
  return { ...data, secrets: rest };
}

export function listSecretNames(data: VaultData): string[] {
  return Object.keys(data.secrets).sort();
}

export function serializeVault(data: VaultData): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVaultData(value: unknown): value is VaultData {
  if (!isRecord(value) || value["version"] !== VAULT_FORMAT_VERSION) {
    return false;
  }
  const kdf = value["kdf"];
  if (!isRecord(kdf) || kdf["name"] !== KDF_NAME || typeof kdf["salt"] !== "string") {
    return false;
  }
  const iterations = kdf["iterations"];
  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    return false;
  }
  if (typeof value["wrappedKey"] !== "string") {
    return false;
  }
  const secrets = value["secrets"];
  if (!isRecord(secrets)) {
    return false;
  }
  return Object.values(secrets).every(
    (secret) => isRecord(secret) && typeof secret["iv"] === "string" && typeof secret["ct"] === "string",
  );
}

export function parseVault(bytes: Uint8Array): VaultData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    throw corrupt(cause);
  }
  if (!isVaultData(parsed)) {
    throw corrupt(undefined);
  }
  return parsed;
}

function corrupt(cause: unknown): AppError {
  return new AppError({
    code: "storage.vault_corrupt",
    category: "storage",
    messageKey: "error.storage.vaultCorrupt",
    message: "Stored vault is damaged or has an unsupported format",
    recoverable: false,
    cause,
  });
}

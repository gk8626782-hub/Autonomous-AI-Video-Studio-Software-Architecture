import { CAPABILITIES } from "@avs/providers";
import type { Capability } from "@avs/providers";

export interface ProviderCatalogEntry {
  readonly id: string;
  readonly displayName: string;
  /** What the provider can do. Used to explain the provider to the user. */
  readonly capabilities: readonly Capability[];
  /** True once the adapter that talks to this provider exists in the app. */
  readonly adapterReady: boolean;
  readonly keyHelpUrl?: string;
}

/**
 * Providers the user can store a key for.
 * Gemini's capabilities were checked against Google's documentation.
 * The OpenAI and ElevenLabs lists are to be confirmed when their adapters are written.
 */
export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: "gemini",
    displayName: "Google Gemini",
    capabilities: ["text", "image", "video", "voice", "music"],
    adapterReady: false,
    keyHelpUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "openai",
    displayName: "OpenAI",
    capabilities: ["text", "image", "voice"],
    adapterReady: false,
  },
  {
    id: "elevenlabs",
    displayName: "ElevenLabs",
    capabilities: ["voice", "music"],
    adapterReady: false,
  },
];

const SECRET_PREFIX = "apikey.";

export function findProvider(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((entry) => entry.id === id);
}

/** Name under which a provider's API key is stored in the vault. */
export function secretNameFor(providerId: string): string {
  return `${SECRET_PREFIX}${providerId}`;
}

/** The provider id behind a vault secret name, or null for other secrets. */
export function providerIdFromSecretName(name: string): string | null {
  return name.startsWith(SECRET_PREFIX) && name.length > SECRET_PREFIX.length
    ? name.slice(SECRET_PREFIX.length)
    : null;
}

/**
 * Tasks the app can do right now: those of providers that have both a stored
 * key and a working adapter. Providers without an adapter do not count yet.
 */
export function configuredCapabilities(
  secretNames: readonly string[],
  catalog: readonly ProviderCatalogEntry[] = PROVIDER_CATALOG,
): Capability[] {
  const withKey = new Set<string>();
  for (const name of secretNames) {
    const id = providerIdFromSecretName(name);
    if (id !== null) {
      withKey.add(id);
    }
  }

  const available = new Set<Capability>();
  for (const entry of catalog) {
    if (entry.adapterReady && withKey.has(entry.id)) {
      for (const capability of entry.capabilities) {
        available.add(capability);
      }
    }
  }
  return CAPABILITIES.filter((capability) => available.has(capability));
}

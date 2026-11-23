import { describe, expect, it } from "vitest";
import {
  PROVIDER_CATALOG,
  configuredCapabilities,
  findProvider,
  providerIdFromSecretName,
  secretNameFor,
} from "./catalog";
import type { ProviderCatalogEntry } from "./catalog";

const sample: ProviderCatalogEntry[] = [
  { id: "alpha", displayName: "Alpha", capabilities: ["image", "text"], adapterReady: true },
  { id: "beta", displayName: "Beta", capabilities: ["voice"], adapterReady: true },
  { id: "gamma", displayName: "Gamma", capabilities: ["video"], adapterReady: false },
];

describe("PROVIDER_CATALOG", () => {
  it("has unique, valid provider ids and at least one capability each", () => {
    const ids = PROVIDER_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of PROVIDER_CATALOG) {
      expect(entry.id).toMatch(/^[a-z0-9][a-z0-9-]{1,39}$/);
      expect(entry.capabilities.length).toBeGreaterThan(0);
      expect(entry.displayName.trim()).not.toBe("");
    }
  });

  it("finds providers by id", () => {
    expect(findProvider("gemini")?.displayName).toBe("Google Gemini");
    expect(findProvider("ghost")).toBeUndefined();
  });
});

describe("secret names", () => {
  it("round-trips and stays valid for the vault", () => {
    for (const entry of PROVIDER_CATALOG) {
      const name = secretNameFor(entry.id);
      expect(name).toMatch(/^[A-Za-z0-9._:-]{1,64}$/);
      expect(providerIdFromSecretName(name)).toBe(entry.id);
    }
  });

  it("returns null for other secrets", () => {
    expect(providerIdFromSecretName("other.secret")).toBeNull();
    expect(providerIdFromSecretName("apikey.")).toBeNull();
  });
});

describe("configuredCapabilities", () => {
  it("counts only providers that have a key and a ready adapter, in a fixed order", () => {
    expect(configuredCapabilities(["apikey.alpha", "apikey.gamma", "other.x"], sample)).toEqual(["text", "image"]);
    expect(configuredCapabilities(["apikey.beta", "apikey.alpha"], sample)).toEqual(["text", "image", "voice"]);
  });

  it("returns nothing without keys", () => {
    expect(configuredCapabilities([], sample)).toEqual([]);
  });

  it("returns nothing for the built-in catalog until adapters exist", () => {
    expect(configuredCapabilities(["apikey.gemini", "apikey.openai", "apikey.elevenlabs"])).toEqual([]);
  });
});

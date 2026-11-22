import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { DEFAULT_LOCALE, detectLocale, isLocale } from "./locale";
import { CATALOGS, createTranslator, errorMessage, interpolate } from "./translate";
import type { Catalog } from "./translate";

const en = CATALOGS.en;
const hi = CATALOGS.hi;

/** Keys that are built at run time (for example "error.validation.${field}"), so no scan can find them. */
const DYNAMIC_KEYS = [
  "error.validation.title",
  "error.validation.duration",
  "error.validation.language",
  "error.validation.status",
  "error.validation.aspect_ratios",
  "error.validation.extension",
  "error.validation.passphrase",
  "error.validation.secret_name",
  "error.validation.secret_value",
  "error.validation.job_type",
  "error.validation.idempotency_key",
  "error.validation.words_per_minute",
  "error.validation.speech_ratio",
  "error.validation.tolerance",
  "error.validation.scene_seconds",
  "error.media.write_failed",
  "error.media.not_found",
  "error.provider.auth",
  "error.provider.quota",
  "error.provider.policy",
  "error.provider.transient",
  "error.provider.bad_output",
  "error.provider.cancelled",
  "error.story.continuationLimit",
  "error.story.emptyOutput",
  "error.story.durationLocked",
  "error.story.underBudget",
  "error.board.invalidVoice",
  "error.board.voiceIncomplete",
  "error.board.viewsIncomplete",
  "error.board.viewsLocked",
  "error.board.characterNotFound",
  "error.board.environmentNotFound",
  "error.board.invalidMedia",
] as const;

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();

const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

describe("message catalogs", () => {
  it("have exactly the same keys in English and Hindi", () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });

  it("have no empty messages", () => {
    for (const catalog of [en, hi] as Catalog[]) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim(), key).not.toBe("");
      }
    }
  });

  it("use the same placeholders in both languages", () => {
    for (const key of Object.keys(en)) {
      expect(placeholders(hi[key] ?? ""), key).toEqual(placeholders(en[key] ?? ""));
    }
  });

  it("contain every message key that is built at run time", () => {
    for (const key of DYNAMIC_KEYS) {
      expect(en[key], key).toBeDefined();
      expect(hi[key], key).toBeDefined();
    }
  });

  it("contain every message key written literally in the packages", () => {
    const pattern = /messageKey:\s*(["'`])([^"'`$\\\n]+)\1/g;
    const found = new Set<string>();

    for (const pkg of readdirSync(packagesDir)) {
      const src = join(packagesDir, pkg, "src");
      if (!existsSync(src)) {
        continue;
      }
      for (const file of sourceFiles(src)) {
        for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
          if (match[2] !== undefined) {
            found.add(match[2]);
          }
        }
      }
    }

    expect(found.size).toBeGreaterThan(20);
    for (const key of found) {
      expect(en[key], `missing English message: ${key}`).toBeDefined();
      expect(hi[key], `missing Hindi message: ${key}`).toBeDefined();
    }
  });
});

describe("locale helpers", () => {
  it("recognizes supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("hi")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("detects the first supported browser language", () => {
    expect(detectLocale(["hi-IN", "en"])).toBe("hi");
    expect(detectLocale(["fr-FR", "hi"])).toBe("hi");
    expect(detectLocale(["en-GB"])).toBe("en");
    expect(detectLocale(["fr", "de"])).toBe(DEFAULT_LOCALE);
    expect(detectLocale([])).toBe(DEFAULT_LOCALE);
  });
});

describe("translator", () => {
  it("fills placeholders and keeps unknown ones", () => {
    expect(interpolate("Hello {name}, {missing}", { name: "Asha" })).toBe("Hello Asha, {missing}");
    expect(interpolate("No params {x}")).toBe("No params {x}");
    expect(interpolate("{n} items", { n: 3 })).toBe("3 items");
  });

  it("translates into the chosen language", () => {
    expect(createTranslator("en")("ui.action.back")).toBe("Back");
    expect(createTranslator("hi")("ui.action.back")).toBe("वापस");
    expect(createTranslator("hi")("ui.story.duration", { minutes: 10 })).toBe("वीडियो की अवधि: 10 मिनट");
  });

  it("falls back to English and then to the key", () => {
    const catalogs = { en: { only: "English only" }, hi: {} };
    expect(createTranslator("hi", catalogs)("only")).toBe("English only");
    expect(createTranslator("hi", catalogs)("nothing.here")).toBe("nothing.here");
  });

  it("translates errors through their message key and parameters", () => {
    const error = new AppError({
      code: "provider.auth",
      category: "auth",
      messageKey: "error.provider.auth",
      message: "rejected",
      recoverable: true,
      params: { provider: "Gemini" },
    });

    expect(errorMessage(createTranslator("en"), error)).toBe("The API key was rejected by Gemini. Check the key.");
    expect(errorMessage(createTranslator("hi"), error)).toBe("Gemini ने API कुंजी स्वीकार नहीं की। कुंजी जाँचें।");
    expect(errorMessage(createTranslator("en"), new Error("boom"))).toBe("Something went wrong. Please try again.");
  });
});

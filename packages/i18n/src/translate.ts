import { isAppError } from "@avs/core";
import { DEFAULT_LOCALE } from "./locale";
import type { Locale } from "./locale";
import en from "./messages/en.json";
import hi from "./messages/hi.json";

export type Catalog = Readonly<Record<string, string>>;
export type MessageParams = Readonly<Record<string, string | number>>;
export type Translator = (key: string, params?: MessageParams) => string;

export const CATALOGS: Readonly<Record<Locale, Catalog>> = { en, hi };

/** Replaces {name} placeholders. Unknown placeholders are left as they are. */
export function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Looks a key up in the chosen language, then in English, and finally returns
 * the key itself so a missing translation is visible but never crashes.
 */
export function createTranslator(
  locale: Locale,
  catalogs: Readonly<Record<Locale, Catalog>> = CATALOGS,
): Translator {
  const primary = catalogs[locale];
  const fallback = catalogs[DEFAULT_LOCALE];
  return (key, params) => interpolate(primary[key] ?? fallback[key] ?? key, params);
}

/** User-facing text for any thrown value. AppError carries its own message key. */
export function errorMessage(t: Translator, error: unknown): string {
  if (isAppError(error)) {
    return t(error.messageKey, error.params);
  }
  return t("error.unknown");
}

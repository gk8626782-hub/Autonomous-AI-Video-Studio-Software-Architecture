"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, createTranslator, detectLocale, isLocale } from "@avs/i18n";
import type { Locale, Translator } from "@avs/i18n";
import { useAppStore } from "../store/app-store";

const STORAGE_KEY = "avs.locale";

const I18nContext = createContext<Translator>(createTranslator(DEFAULT_LOCALE));

function readSavedLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage can be blocked. The choice then lasts only for this visit.
  }
}

/** Chooses the language on first load: the saved choice, else the browser's language. */
export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const locale = useAppStore((state) => state.ui_locale);
  const setLocale = useAppStore((state) => state.ui_setLocale);

  useEffect(() => {
    setLocale(readSavedLocale() ?? detectLocale(navigator.languages));
  }, [setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const translate = useMemo(() => createTranslator(locale), [locale]);
  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
}

export function useT(): Translator {
  return useContext(I18nContext);
}

export function useLocale(): { locale: Locale; changeLocale: (next: Locale) => void } {
  const locale = useAppStore((state) => state.ui_locale);
  const setLocale = useAppStore((state) => state.ui_setLocale);
  return {
    locale,
    changeLocale: (next) => {
      setLocale(next);
      saveLocale(next);
    },
  };
}

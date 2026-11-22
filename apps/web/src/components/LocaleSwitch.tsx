"use client";

import { LOCALES } from "@avs/i18n";
import { useLocale, useT } from "../lib/i18n";

export function LocaleSwitch() {
  const t = useT();
  const { locale, changeLocale } = useLocale();

  return (
    <div className="locale-switch" role="group" aria-label={t("ui.form.language")}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          className={code === locale ? "chip active" : "chip"}
          aria-pressed={code === locale}
          onClick={() => changeLocale(code)}
        >
          {t(`ui.locale.${code}`)}
        </button>
      ))}
    </div>
  );
}

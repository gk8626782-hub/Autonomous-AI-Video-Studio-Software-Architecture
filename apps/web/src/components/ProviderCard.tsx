"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { ProviderCatalogEntry } from "@avs/keys";
import { useT } from "../lib/i18n";

interface ProviderCardProps {
  readonly entry: ProviderCatalogEntry;
  readonly hasKey: boolean;
  readonly unlocked: boolean;
  readonly busy: boolean;
  readonly onSave: (apiKey: string) => Promise<void>;
  readonly onRemove: () => Promise<void>;
}

/** One AI provider: what it can do, whether a key is saved, and a field to save or remove the key. */
export function ProviderCard({ entry, hasKey, unlocked, busy, onSave, onRemove }: ProviderCardProps) {
  const t = useT();
  const [apiKey, setApiKey] = useState("");

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(apiKey);
    setApiKey("");
  }

  return (
    <article className="card provider-card">
      <header className="card-head">
        <div>
          <h3>{entry.displayName}</h3>
          <p className="muted">
            {t("ui.providers.capabilities", {
              list: entry.capabilities.map((capability) => t(`ui.capability.${capability}`)).join(", "),
            })}
          </p>
        </div>
        <span className={hasKey ? "badge ok" : "badge"}>
          {hasKey ? t("ui.providers.keySaved") : t("ui.providers.noKey")}
        </span>
      </header>

      {!entry.adapterReady && <p className="muted">{t("ui.providers.notReady")}</p>}

      {entry.keyHelpUrl !== undefined && (
        <div className="slot-actions">
          <a className="link-button" href={entry.keyHelpUrl} target="_blank" rel="noopener noreferrer">
            {t("ui.providers.getKey")}
          </a>
        </div>
      )}

      {unlocked ? (
        <form className="form" onSubmit={(event) => void handleSave(event)}>
          <label>
            {t("ui.providers.apiKey")}
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <button type="submit" className="primary" disabled={busy || apiKey.trim() === ""}>
            {t("ui.providers.save")}
          </button>
          {hasKey && (
            <button type="button" className="danger" disabled={busy} onClick={() => void onRemove()}>
              {t("ui.providers.remove")}
            </button>
          )}
        </form>
      ) : (
        <p className="muted">{t("ui.providers.unlockFirst")}</p>
      )}
    </article>
  );
}

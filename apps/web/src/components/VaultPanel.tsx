"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useT } from "../lib/i18n";
import { AUTO_LOCK_MINUTES } from "../lib/vault";
import type { VaultController } from "../lib/vault";

interface VaultPanelProps {
  readonly vault: VaultController;
}

export function VaultPanel({ vault }: VaultPanelProps) {
  const t = useT();
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await vault.create(passphrase, confirmation);
    setPassphrase("");
    setConfirmation("");
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await vault.unlock(passphrase);
    setPassphrase("");
  }

  async function handleReset() {
    if (window.confirm(t("ui.vault.resetConfirm"))) {
      await vault.reset();
    }
  }

  const resetButton = (
    <button type="button" className="danger" disabled={vault.busy} onClick={() => void handleReset()}>
      {t("ui.vault.reset")}
    </button>
  );

  return (
    <div className="stack">
      <p className="muted">{t("ui.vault.explain")}</p>

      {vault.state === "unknown" && <p className="muted">{t("ui.project.loading")}</p>}

      {vault.state === "none" && (
        <>
          <p className="muted">{t("ui.vault.state.none")}</p>
          <p className="warn">{t("ui.vault.noRecovery")}</p>
          <form className="form" onSubmit={(event) => void handleCreate(event)}>
            <label>
              {t("ui.vault.passphrase")}
              <input
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <label>
              {t("ui.vault.confirm")}
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={vault.busy || passphrase === ""}>
              {t("ui.vault.create")}
            </button>
          </form>
        </>
      )}

      {vault.state === "locked" && (
        <>
          <p className="muted">{t("ui.vault.state.locked")}</p>
          <form className="form" onSubmit={(event) => void handleUnlock(event)}>
            <label>
              {t("ui.vault.passphrase")}
              <input
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={vault.busy || passphrase === ""}>
              {t("ui.action.unlock")}
            </button>
          </form>
          {resetButton}
        </>
      )}

      {vault.state === "unlocked" && (
        <>
          <p className="ok">{t("ui.vault.state.unlocked")}</p>
          <p className="muted">{t("ui.vault.autoLock", { minutes: AUTO_LOCK_MINUTES })}</p>
          <div className="slot-actions">
            <button type="button" disabled={vault.busy} onClick={vault.lock}>
              {t("ui.action.lock")}
            </button>
            {resetButton}
          </div>
        </>
      )}
    </div>
  );
}

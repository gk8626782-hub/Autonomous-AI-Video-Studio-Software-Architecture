"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppError } from "@avs/core";
import { errorMessage } from "@avs/i18n";
import { secretNameFor } from "@avs/keys";
import { useAppStore } from "../store/app-store";
import type { VaultUiState } from "../store/app-store";
import { useT } from "./i18n";
import { refreshProviderStatus } from "./provider-status";
import { getServices } from "./services";

export const AUTO_LOCK_MINUTES = 15;

export interface VaultController {
  readonly state: VaultUiState;
  readonly secretNames: readonly string[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  create(passphrase: string, confirmation: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  saveKey(providerId: string, apiKey: string): Promise<void>;
  removeKey(providerId: string): Promise<void>;
  reset(): Promise<void>;
}

/** The key vault for the settings screen. It locks itself after a period without use. */
export function useVault(): VaultController {
  const t = useT();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const state = useAppStore((s) => s.vault_state);
  const secretNames = useAppStore((s) => s.vault_secretNames);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    refreshProviderStatus().catch((cause: unknown) => setError(errorMessage(tRef.current, cause)));
  }, []);

  const lock = useCallback((): void => {
    getServices().vault.lock();
    refreshProviderStatus().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (state !== "unlocked") {
      return;
    }
    const delay = AUTO_LOCK_MINUTES * 60_000;
    let timer = window.setTimeout(lock, delay);
    const restart = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, delay);
    };
    window.addEventListener("pointerdown", restart);
    window.addEventListener("keydown", restart);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", restart);
      window.removeEventListener("keydown", restart);
    };
  }, [state, lock]);

  const run = useCallback(async (task: () => Promise<void>, showSaved = false): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      await refreshProviderStatus();
      if (showSaved) {
        setNotice(tRef.current("ui.settings.saved"));
      }
    } catch (cause) {
      setError(errorMessage(tRef.current, cause));
      await refreshProviderStatus().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    state,
    secretNames,
    busy,
    error,
    notice,
    create: (passphrase, confirmation) =>
      run(async () => {
        if (passphrase !== confirmation) {
          throw new AppError({
            code: "keys.passphrase_mismatch",
            category: "validation",
            messageKey: "ui.vault.mismatch",
            message: "The two passphrases do not match",
            recoverable: true,
          });
        }
        await getServices().vault.create(passphrase);
      }),
    unlock: (passphrase) =>
      run(async () => {
        await getServices().vault.unlock(passphrase);
      }),
    lock,
    saveKey: (providerId, apiKey) =>
      run(async () => {
        await getServices().vault.setSecret(secretNameFor(providerId), apiKey.trim());
      }, true),
    removeKey: (providerId) =>
      run(async () => {
        await getServices().vault.removeSecret(secretNameFor(providerId));
      }),
    reset: () =>
      run(async () => {
        await getServices().vault.reset();
      }),
  };
}

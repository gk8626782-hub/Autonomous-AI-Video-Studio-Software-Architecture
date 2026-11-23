"use client";

import { useEffect } from "react";
import { configuredCapabilities } from "@avs/keys";
import { useAppStore } from "../store/app-store";
import { getServices } from "./services";

/** Reads the vault state and key names into the app state, and works out which tasks are ready. */
export async function refreshProviderStatus(): Promise<void> {
  const vault = getServices().vault;
  const [state, names] = await Promise.all([vault.state(), vault.secretNames()]);

  const store = useAppStore.getState();
  store.vault_set(state, names);
  store.ai_setConfigured(configuredCapabilities(names));
}

/** Call once in a screen that shows or needs provider status. */
export function useProviderStatus(): void {
  useEffect(() => {
    refreshProviderStatus().catch(() => undefined);
  }, []);
}

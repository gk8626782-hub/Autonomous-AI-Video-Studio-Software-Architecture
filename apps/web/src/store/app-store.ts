import { create } from "zustand";
import { DEFAULT_LOCALE } from "@avs/i18n";
import type { Locale } from "@avs/i18n";
import type { Capability } from "@avs/providers";
import type { CharacterRecord, EnvironmentRecord, MediaStatus, StorageLevel } from "@avs/storage";

/**
 * App state. Every field and action starts with its namespace prefix
 * (ui_, story_, char_, env_, media_, device_, ai_). See @avs/core namespaces.
 */
export interface AppState {
  // ui
  ui_locale: Locale;
  /** CSS selector of the slot that is currently blinking red, or null. */
  ui_alertPath: string | null;
  ui_setLocale: (locale: Locale) => void;
  ui_setAlertPath: (path: string | null) => void;

  // story
  story_passed: boolean;
  story_durationMin: number | null;
  story_setStatus: (passed: boolean, durationMin: number | null) => void;

  // char
  char_items: CharacterRecord[];
  char_setItems: (items: CharacterRecord[]) => void;

  // env
  env_items: EnvironmentRecord[];
  env_setItems: (items: EnvironmentRecord[]) => void;

  // media
  media_statuses: Record<string, MediaStatus>;
  media_setStatuses: (statuses: Record<string, MediaStatus>) => void;

  // device
  device_storageLevel: StorageLevel | "unknown";
  device_usageBytes: number | null;
  device_quotaBytes: number | null;
  device_persisted: boolean | null;
  device_setStorage: (level: StorageLevel | "unknown", usageBytes: number | null, quotaBytes: number | null) => void;
  device_setPersisted: (persisted: boolean | null) => void;

  // ai
  ai_configured: Capability[];
  ai_required: Capability[];
  ai_setConfigured: (capabilities: Capability[]) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  ui_locale: DEFAULT_LOCALE,
  ui_alertPath: null,
  ui_setLocale: (locale) => set({ ui_locale: locale }),
  ui_setAlertPath: (path) => set({ ui_alertPath: path }),

  story_passed: false,
  story_durationMin: null,
  story_setStatus: (passed, durationMin) => set({ story_passed: passed, story_durationMin: durationMin }),

  char_items: [],
  char_setItems: (items) => set({ char_items: items }),

  env_items: [],
  env_setItems: (items) => set({ env_items: items }),

  media_statuses: {},
  media_setStatuses: (statuses) => set({ media_statuses: statuses }),

  device_storageLevel: "unknown",
  device_usageBytes: null,
  device_quotaBytes: null,
  device_persisted: null,
  device_setStorage: (level, usageBytes, quotaBytes) =>
    set({ device_storageLevel: level, device_usageBytes: usageBytes, device_quotaBytes: quotaBytes }),
  device_setPersisted: (persisted) => set({ device_persisted: persisted }),

  // Text writes the story, images draw the characters, voice speaks the lines.
  ai_configured: [],
  ai_required: ["text", "image", "voice"],
  ai_setConfigured: (capabilities) => set({ ai_configured: capabilities }),
}));

import { afterEach, describe, expect, it } from "vitest";
import { findNamespaceViolations, namespaceOf } from "@avs/core";
import { useAppStore } from "./app-store";

const initial = useAppStore.getState();

afterEach(() => {
  useAppStore.setState(initial, true);
});

describe("app store", () => {
  it("prefixes every field and action with a known namespace", () => {
    const state = useAppStore.getState() as unknown as Record<string, unknown>;
    const groups: Record<string, Record<string, unknown>> = {};

    for (const key of Object.keys(state)) {
      const namespace = namespaceOf(key) ?? "unprefixed";
      (groups[namespace] ??= {})[key] = state[key];
    }

    expect(Object.keys(groups)).not.toContain("unprefixed");
    expect(findNamespaceViolations(groups)).toEqual([]);
  });

  it("starts with an empty board and no alert", () => {
    const state = useAppStore.getState();
    expect(state.ui_alertPath).toBeNull();
    expect(state.char_items).toEqual([]);
    expect(state.env_items).toEqual([]);
    expect(state.story_passed).toBe(false);
    expect(state.ai_required).toEqual(["text", "image", "voice"]);
  });

  it("updates through its actions", () => {
    const state = useAppStore.getState();
    state.ui_setLocale("hi");
    state.ui_setAlertPath('[data-slot="x"]');
    state.story_setStatus(true, 12);
    state.media_setStatuses({ a: "ok" });
    state.device_setStorage("warn", 10, 100);
    state.device_setPersisted(true);
    state.ai_setConfigured(["text"]);

    expect(useAppStore.getState()).toMatchObject({
      ui_locale: "hi",
      ui_alertPath: '[data-slot="x"]',
      story_passed: true,
      story_durationMin: 12,
      media_statuses: { a: "ok" },
      device_storageLevel: "warn",
      device_usageBytes: 10,
      device_quotaBytes: 100,
      device_persisted: true,
      ai_configured: ["text"],
    });
  });
});

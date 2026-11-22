import { beforeEach, describe, expect, it } from "vitest";
import { ValidationRegistry } from "@avs/core";
import type { CharacterRecord, EnvironmentRecord, MediaStatus } from "@avs/storage";
import { BoardValidation, GENERATE_SCOPE, isMediaReady, isPanoramaReady, isVoiceReady } from "./validation";
import type { BoardSnapshot } from "./validation";

const character = (id = "c1"): CharacterRecord => ({
  id,
  projectId: "p1",
  name: id,
  role: "",
  species: "human",
  ageGroup: "child",
  gender: "female",
  appearance: "",
  voiceTraits: "",
  viewSlots: { front: `${id}-f`, left: `${id}-l`, right: `${id}-r`, back: `${id}-b`, threeQuarter: null },
  voiceSlot: { mode: "ai", providerId: "mock", voiceId: "v1", sampleRef: null, locked: true },
  viewsLocked: true,
});

const environment = (id = "e1"): EnvironmentRecord => ({
  id,
  projectId: "p1",
  name: id,
  mode: "ai",
  panoramaRef: `${id}-pano`,
  seamScore: 0.4,
});

function statuses(...ids: string[]): Map<string, MediaStatus> {
  return new Map(ids.map((id) => [id, "ok" as const]));
}

const allMedia = ["c1-f", "c1-l", "c1-r", "c1-b", "e1-pano"];

function snapshot(overrides: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    storyPassed: true,
    durationMin: 4,
    characters: [character()],
    environments: [environment()],
    mediaStatus: statuses(...allMedia),
    configuredCapabilities: new Set(["text", "image", "voice"]),
    requiredCapabilities: new Set(["text", "image", "voice"]),
    storageLevel: "ok",
    ...overrides,
  };
}

let registry: ValidationRegistry;
let current: BoardSnapshot;
let validation: BoardValidation;

const issueIds = () => registry.evaluate(GENERATE_SCOPE).map((issue) => issue.id);

beforeEach(() => {
  registry = new ValidationRegistry();
  current = snapshot();
  validation = new BoardValidation(registry, () => current);
  validation.sync();
});

describe("helpers", () => {
  it("checks media, voice and panorama readiness", () => {
    expect(isMediaReady("a", statuses("a"))).toBe(true);
    expect(isMediaReady("a", new Map([["a", "missing" as const]]))).toBe(false);
    expect(isMediaReady(null, statuses("a"))).toBe(false);
    expect(isMediaReady("ghost", statuses("a"))).toBe(false);

    const locked = { mode: "ai" as const, providerId: "p", voiceId: "v", sampleRef: null, locked: true };
    expect(isVoiceReady(locked, new Map())).toBe(true);
    expect(isVoiceReady({ ...locked, locked: false }, new Map())).toBe(false);
    const upload = { mode: "upload" as const, providerId: null, voiceId: null, sampleRef: "s", locked: true };
    expect(isVoiceReady(upload, new Map())).toBe(false);
    expect(isVoiceReady(upload, statuses("s"))).toBe(true);

    expect(isPanoramaReady(environment(), statuses("e1-pano"))).toBe(true);
    expect(isPanoramaReady({ ...environment(), seamScore: 1.5 }, statuses("e1-pano"))).toBe(false);
    expect(isPanoramaReady({ ...environment(), seamScore: null }, statuses("e1-pano"))).toBe(false);
  });
});

describe("BoardValidation", () => {
  it("is valid when everything is filled", () => {
    expect(registry.isValid(GENERATE_SCOPE)).toBe(true);
    expect(issueIds()).toEqual([]);
  });

  it("reports an empty view slot and points at it", () => {
    const empty = { ...character(), viewSlots: { ...character().viewSlots, back: null } };
    current = snapshot({ characters: [empty] });

    expect(issueIds()).toEqual(["char:c1:view:back"]);
    expect(registry.firstIssue(GENERATE_SCOPE)?.domPath).toBe('[data-slot="char-c1-view-back"]');
  });

  it("reports a view whose file is missing", () => {
    current = snapshot({ mediaStatus: new Map([...statuses(...allMedia)].map(([id, s]) => [id, id === "c1-l" ? "missing" : s])) });
    expect(issueIds()).toEqual(["char:c1:view:left"]);
  });

  it("lists problems in board order: views before lock, lock before voice", () => {
    const bare: CharacterRecord = {
      ...character(),
      viewSlots: { front: null, left: null, right: null, back: null, threeQuarter: null },
      voiceSlot: { mode: null, providerId: null, voiceId: null, sampleRef: null, locked: false },
      viewsLocked: false,
    };
    current = snapshot({ characters: [bare] });

    expect(issueIds()).toEqual([
      "char:c1:view:front",
      "char:c1:view:left",
      "char:c1:view:right",
      "char:c1:view:back",
      "char:c1:views_locked",
      "char:c1:voice",
    ]);
  });

  it("requires the voice to be locked", () => {
    current = snapshot({ characters: [{ ...character(), voiceSlot: { ...character().voiceSlot, locked: false } }] });
    expect(issueIds()).toEqual(["char:c1:voice"]);
  });

  it("requires a valid panorama for every environment", () => {
    current = snapshot({ environments: [{ ...environment(), seamScore: 1.5 }] });
    expect(issueIds()).toEqual(["env:e1:panorama"]);

    current = snapshot({ environments: [{ ...environment(), panoramaRef: null, seamScore: null }] });
    expect(issueIds()).toEqual(["env:e1:panorama"]);
  });

  it("requires at least one environment", () => {
    current = snapshot({ environments: [] });
    validation.sync();
    expect(issueIds()).toEqual(["board:environments"]);
  });

  it("checks story, duration, providers and storage", () => {
    current = snapshot({
      storyPassed: false,
      durationMin: null,
      configuredCapabilities: new Set(["text"]),
      storageLevel: "block",
    });
    expect(issueIds()).toEqual([
      "story:passed",
      "story:duration",
      "provider:image",
      "provider:voice",
      "device:storage",
    ]);

    current = snapshot({ storageLevel: "warn" });
    expect(registry.isValid(GENERATE_SCOPE)).toBe(true);
    current = snapshot({ storageLevel: "unknown" });
    expect(registry.isValid(GENERATE_SCOPE)).toBe(true);
  });

  it("adds and removes rules when characters change", () => {
    const bare: CharacterRecord = {
      ...character("c2"),
      viewSlots: { front: null, left: null, right: null, back: null, threeQuarter: null },
      viewsLocked: false,
    };
    current = snapshot({ characters: [character(), bare] });
    validation.sync();

    expect(issueIds()).toContain("char:c2:view:front");
    expect(issueIds()).toContain("char:c2:views_locked");

    current = snapshot({ characters: [character()] });
    validation.sync();
    expect(issueIds()).toEqual([]);
  });

  it("does not register a rule twice when synced repeatedly", () => {
    validation.sync();
    validation.sync();
    expect(registry.evaluate()).toEqual([]);
  });

  it("removes every rule on dispose", () => {
    current = snapshot({ storyPassed: false });
    expect(issueIds()).toEqual(["story:passed"]);

    validation.dispose();
    expect(issueIds()).toEqual([]);
  });
});

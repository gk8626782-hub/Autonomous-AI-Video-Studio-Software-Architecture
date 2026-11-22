import { describe, expect, it } from "vitest";
import {
  bindClonedVoice,
  emptyViewSlots,
  emptyVoiceSlot,
  isVoiceComplete,
  lockVoice,
  missingViews,
  setAiVoice,
  setUploadedVoice,
  setView,
  unlockVoice,
} from "./slots";

describe("view slots", () => {
  it("starts empty and lists every missing required view", () => {
    expect(missingViews(emptyViewSlots())).toEqual(["front", "left", "right", "back"]);
  });

  it("sets views without changing the original and ignores the optional view", () => {
    const empty = emptyViewSlots();
    const withFront = setView(empty, "front", "m1");

    expect(empty.front).toBeNull();
    expect(withFront.front).toBe("m1");
    expect(missingViews(withFront)).toEqual(["left", "right", "back"]);

    const all = setView(setView(setView(withFront, "left", "m2"), "right", "m3"), "back", "m4");
    expect(missingViews(all)).toEqual([]);
    expect(all.threeQuarter).toBeNull();
  });

  it("can clear a view", () => {
    const slots = setView(emptyViewSlots(), "front", "m1");
    expect(setView(slots, "front", null).front).toBeNull();
  });
});

describe("voice slot", () => {
  it("is incomplete until a voice is chosen", () => {
    expect(isVoiceComplete(emptyVoiceSlot())).toBe(false);
    expect(() => lockVoice(emptyVoiceSlot())).toThrowError(/before locking/);
  });

  it("completes with an AI voice and locks it", () => {
    const slot = setAiVoice(emptyVoiceSlot(), "eleven", "voice-1");
    expect(slot).toEqual({ mode: "ai", providerId: "eleven", voiceId: "voice-1", sampleRef: null, locked: false });
    expect(isVoiceComplete(slot)).toBe(true);

    const locked = lockVoice(slot);
    expect(locked.locked).toBe(true);
    expect(unlockVoice(locked).locked).toBe(false);
  });

  it("completes with an uploaded sample and can later be bound to a cloned voice", () => {
    const slot = setUploadedVoice(emptyVoiceSlot(), "sample-1");
    expect(isVoiceComplete(slot)).toBe(true);

    const bound = bindClonedVoice(slot, "eleven", "clone-9");
    expect(bound).toMatchObject({ mode: "upload", sampleRef: "sample-1", providerId: "eleven", voiceId: "clone-9" });
  });

  it("changing the voice unlocks it", () => {
    const locked = lockVoice(setAiVoice(emptyVoiceSlot(), "eleven", "voice-1"));
    expect(setAiVoice(locked, "eleven", "voice-2").locked).toBe(false);
    expect(setUploadedVoice(locked, "sample-1").locked).toBe(false);
  });

  it("rejects empty values and binding an AI voice to a clone", () => {
    expect(() => setAiVoice(emptyVoiceSlot(), "", "v")).toThrowError(/must not be empty/);
    expect(() => setUploadedVoice(emptyVoiceSlot(), " ")).toThrowError(/must not be empty/);
    expect(() => bindClonedVoice(setAiVoice(emptyVoiceSlot(), "p", "v"), "p", "v2")).toThrowError(/uploaded voice/);
  });
});

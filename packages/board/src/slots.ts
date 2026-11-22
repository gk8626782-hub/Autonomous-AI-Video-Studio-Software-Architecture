import { AppError } from "@avs/core";
import type { CharacterViewSlots, VoiceSlot } from "@avs/storage";

/** Every character needs these four angles. The three-quarter view is optional. */
export const REQUIRED_VIEWS = ["front", "left", "right", "back"] as const;
export type RequiredView = (typeof REQUIRED_VIEWS)[number];
export type CharacterView = keyof CharacterViewSlots;

export function boardError(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): AppError {
  return new AppError({
    code: `board.${code}`,
    category: "validation",
    messageKey: `error.board.${code.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`,
    message,
    recoverable: true,
    details,
  });
}

export function emptyViewSlots(): CharacterViewSlots {
  return { front: null, left: null, right: null, back: null, threeQuarter: null };
}

export function emptyVoiceSlot(): VoiceSlot {
  return { mode: null, providerId: null, voiceId: null, sampleRef: null, locked: false };
}

export function missingViews(slots: CharacterViewSlots): RequiredView[] {
  return REQUIRED_VIEWS.filter((view) => slots[view] === null);
}

export function setView(
  slots: CharacterViewSlots,
  view: CharacterView,
  mediaId: string | null,
): CharacterViewSlots {
  return { ...slots, [view]: mediaId };
}

/** A voice is complete when an AI voice is chosen, or a sample has been uploaded. */
export function isVoiceComplete(slot: VoiceSlot): boolean {
  if (slot.mode === "ai") {
    return slot.providerId !== null && slot.voiceId !== null;
  }
  if (slot.mode === "upload") {
    return slot.sampleRef !== null;
  }
  return false;
}

export function setAiVoice(slot: VoiceSlot, providerId: string, voiceId: string): VoiceSlot {
  if (providerId.trim() === "" || voiceId.trim() === "") {
    throw boardError("invalid_voice", "Provider and voice must not be empty");
  }
  return { ...slot, mode: "ai", providerId, voiceId, sampleRef: null, locked: false };
}

/** The uploaded sample is the reference for cloning. The clone binding is added later. */
export function setUploadedVoice(slot: VoiceSlot, sampleRef: string): VoiceSlot {
  if (sampleRef.trim() === "") {
    throw boardError("invalid_voice", "Sample reference must not be empty");
  }
  return { ...slot, mode: "upload", providerId: null, voiceId: null, sampleRef, locked: false };
}

/** Stores the voice created from an uploaded sample by a provider. */
export function bindClonedVoice(slot: VoiceSlot, providerId: string, voiceId: string): VoiceSlot {
  if (slot.mode !== "upload") {
    throw boardError("invalid_voice", "Only an uploaded voice can be bound to a cloned voice");
  }
  if (providerId.trim() === "" || voiceId.trim() === "") {
    throw boardError("invalid_voice", "Provider and voice must not be empty");
  }
  return { ...slot, providerId, voiceId };
}

export function lockVoice(slot: VoiceSlot): VoiceSlot {
  if (!isVoiceComplete(slot)) {
    throw boardError("voice_incomplete", "Choose or upload a voice before locking it");
  }
  return { ...slot, locked: true };
}

export function unlockVoice(slot: VoiceSlot): VoiceSlot {
  return { ...slot, locked: false };
}

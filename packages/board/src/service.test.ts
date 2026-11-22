import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaService, MemoryFileStore, StudioDatabase } from "@avs/storage";
import type { MediaKind } from "@avs/storage";
import { BoardService } from "./service";
import type { CharacterDraft } from "./service";

let db: StudioDatabase;
let files: MemoryFileStore;
let media: MediaService;
let board: BoardService;
let mediaCounter: number;
let boardCounter: number;

const draft = (overrides: Partial<CharacterDraft> = {}): CharacterDraft => ({
  name: "Asha",
  role: "hero",
  species: "human",
  ageGroup: "child",
  gender: "female",
  appearance: "red scarf",
  voiceTraits: "",
  ...overrides,
});

async function addMedia(kind: MediaKind, projectId = "p1") {
  const isAudio = kind === "audio";
  return media.ingest(new Blob(["data"]), {
    projectId,
    kind,
    origin: "upload",
    mime: isAudio ? "audio/mpeg" : "image/png",
    extension: isAudio ? "mp3" : "png",
  });
}

async function fillViews(characterId: string): Promise<void> {
  for (const view of ["front", "left", "right", "back"] as const) {
    const image = await addMedia("image");
    await board.setCharacterView(characterId, view, image.id);
  }
}

beforeEach(() => {
  db = new StudioDatabase(`avs-board-${Math.random().toString(36).slice(2)}`);
  files = new MemoryFileStore();
  mediaCounter = 0;
  boardCounter = 0;
  media = new MediaService(db, files, { now: () => 1, newId: () => `m${++mediaCounter}` });
  board = new BoardService(db, { newId: () => `b${++boardCounter}` });
});

afterEach(async () => {
  await db.delete();
});

describe("characters", () => {
  it("creates slots for characters found in the story", async () => {
    const characters = await board.syncCharacters("p1", [draft(), draft({ name: "Moti", species: "dog" })]);

    expect(characters.map((c) => c.name)).toEqual(["Asha", "Moti"]);
    expect(characters[0]).toMatchObject({
      projectId: "p1",
      viewSlots: { front: null, left: null, right: null, back: null, threeQuarter: null },
      voiceSlot: { mode: null, locked: false },
      viewsLocked: false,
    });
  });

  it("keeps existing slots when the story is analysed again", async () => {
    const [asha] = await board.syncCharacters("p1", [draft()]);
    const image = await addMedia("image");
    await board.setCharacterView(asha!.id, "front", image.id);

    const again = await board.syncCharacters("p1", [draft({ name: " asha ", appearance: "blue scarf" }), draft({ name: "Ravi" })]);

    expect(again.map((c) => c.name)).toEqual(["Asha", "Ravi"]);
    expect(again[0]?.viewSlots.front).toBe(image.id);
    expect(again[0]?.appearance).toBe("blue scarf");
  });

  it("does not change the description of a character whose views are locked", async () => {
    const [asha] = await board.syncCharacters("p1", [draft()]);
    await db.characters.update(asha!.id, { viewsLocked: true });

    const again = await board.syncCharacters("p1", [draft({ appearance: "blue scarf" })]);
    expect(again[0]?.appearance).toBe("red scarf");
  });

  it("only accepts usable images of the same project for a view", async () => {
    const [asha] = await board.syncCharacters("p1", [draft()]);
    const audio = await addMedia("audio");
    const otherProject = await addMedia("image", "p2");
    const good = await addMedia("image");

    await expect(board.setCharacterView(asha!.id, "front", audio.id)).rejects.toMatchObject({ code: "board.invalid_media" });
    await expect(board.setCharacterView(asha!.id, "front", otherProject.id)).rejects.toMatchObject({
      code: "board.invalid_media",
    });
    await expect(board.setCharacterView(asha!.id, "front", "ghost")).rejects.toMatchObject({
      code: "board.invalid_media",
    });

    const updated = await board.setCharacterView(asha!.id, "front", good.id);
    expect(updated.viewSlots.front).toBe(good.id);
  });

  it("rejects media that is missing from storage", async () => {
    const [asha] = await board.syncCharacters("p1", [draft()]);
    const image = await addMedia("image");
    await files.remove(image.opfsPath);
    await media.verify(image.id);

    await expect(board.setCharacterView(asha!.id, "front", image.id)).rejects.toMatchObject({
      code: "board.invalid_media",
    });
  });

  it("locks the views only when every required angle is filled, and a lock freezes them", async () => {
    const [asha] = await board.syncCharacters("p1", [draft()]);
    const first = await addMedia("image");
    await board.setCharacterView(asha!.id, "front", first.id);

    await expect(board.lockViews(asha!.id)).rejects.toMatchObject({ code: "board.views_incomplete" });

    await fillViews(asha!.id);
    const locked = await board.lockViews(asha!.id);
    expect(locked.viewsLocked).toBe(true);

    const extra = await addMedia("image");
    await expect(board.setCharacterView(asha!.id, "front", extra.id)).rejects.toMatchObject({
      code: "board.views_locked",
    });
    await expect(board.clearCharacterView(asha!.id, "front")).rejects.toMatchObject({ code: "board.views_locked" });

    await board.unlockViews(asha!.id);
    const cleared = await board.clearCharacterView(asha!.id, "front");
    expect(cleared.viewSlots.front).toBeNull();
  });

  it("handles the voice slot for AI and uploaded voices", async () => {
    const [asha] = await board.syncCharacters("p1", [draft()]);

    await expect(board.lockVoice(asha!.id)).rejects.toMatchObject({ code: "board.voice_incomplete" });

    await board.setVoiceAi(asha!.id, "eleven", "voice-1");
    const locked = await board.lockVoice(asha!.id);
    expect(locked.voiceSlot).toMatchObject({ mode: "ai", providerId: "eleven", voiceId: "voice-1", locked: true });

    const sample = await addMedia("audio");
    const uploaded = await board.setVoiceUpload(asha!.id, sample.id);
    expect(uploaded.voiceSlot).toMatchObject({ mode: "upload", sampleRef: sample.id, locked: false });

    const bound = await board.bindClonedVoice(asha!.id, "eleven", "clone-1");
    expect(bound.voiceSlot).toMatchObject({ providerId: "eleven", voiceId: "clone-1" });

    const image = await addMedia("image");
    await expect(board.setVoiceUpload(asha!.id, image.id)).rejects.toMatchObject({ code: "board.invalid_media" });
  });

  it("fails for an unknown character and removes characters", async () => {
    await expect(board.lockViews("ghost")).rejects.toMatchObject({ code: "board.character_not_found" });

    const [asha] = await board.syncCharacters("p1", [draft()]);
    await board.removeCharacter(asha!.id);
    expect(await board.listCharacters("p1")).toEqual([]);
  });
});

describe("environments", () => {
  it("creates one slot per place and keeps existing panoramas", async () => {
    const [village] = await board.syncEnvironments("p1", [{ name: "Village", description: "green" }]);
    const panorama = await addMedia("panorama");
    await board.setPanorama(village!.id, panorama.id, { mode: "upload", seamScore: 0.4 });

    const again = await board.syncEnvironments("p1", [
      { name: "village", description: "changed" },
      { name: "River", description: "wide" },
    ]);

    expect(again.map((e) => e.name)).toEqual(["River", "Village"]);
    const kept = again.find((e) => e.name === "Village");
    expect(kept).toMatchObject({ panoramaRef: panorama.id, seamScore: 0.4, mode: "upload", description: "green" });
  });

  it("only accepts a usable panorama of the same project", async () => {
    const [village] = await board.syncEnvironments("p1", [{ name: "Village", description: "" }]);
    const image = await addMedia("image");

    await expect(board.setPanorama(village!.id, image.id, { mode: "ai", seamScore: 0.1 })).rejects.toMatchObject({
      code: "board.invalid_media",
    });
  });

  it("clears a panorama and removes environments", async () => {
    const [village] = await board.syncEnvironments("p1", [{ name: "Village", description: "" }]);
    const panorama = await addMedia("panorama");
    await board.setPanorama(village!.id, panorama.id, { mode: "ai", seamScore: 0.1 });

    expect(await board.clearPanorama(village!.id)).toMatchObject({ mode: null, panoramaRef: null, seamScore: null });

    await board.removeEnvironment(village!.id);
    expect(await board.listEnvironments("p1")).toEqual([]);
    await expect(board.clearPanorama("ghost")).rejects.toMatchObject({ code: "board.environment_not_found" });
  });
});

describe("loadBoard", () => {
  it("returns slots with the last known media statuses", async () => {
    const [asha] = await board.syncCharacters("p1", [draft()]);
    const [village] = await board.syncEnvironments("p1", [{ name: "Village", description: "" }]);
    const image = await addMedia("image");
    const panorama = await addMedia("panorama");
    await board.setCharacterView(asha!.id, "front", image.id);
    await board.setPanorama(village!.id, panorama.id, { mode: "upload", seamScore: 0.2 });

    await files.remove(image.opfsPath);
    await media.verifyProject("p1");

    const loaded = await board.loadBoard("p1");
    expect(loaded.characters).toHaveLength(1);
    expect(loaded.environments).toHaveLength(1);
    expect(loaded.mediaStatus.get(image.id)).toBe("missing");
    expect(loaded.mediaStatus.get(panorama.id)).toBe("ok");
  });
});

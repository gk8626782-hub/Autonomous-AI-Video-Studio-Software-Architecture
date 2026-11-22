import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioDatabase } from "@avs/storage";
import { StoryStore } from "./store";
import type { StoredStory } from "./store";
import type { StoryProgress } from "./types";

let db: StudioDatabase;
let store: StoryStore;
let clock: number;

const chunk = (index: number, text: string) => ({
  index,
  sceneStart: index * 2,
  sceneEnd: index * 2 + 2,
  text,
  words: text.split(" ").length,
});

const progress = (chunks: ReturnType<typeof chunk>[]): StoryProgress => ({
  chunks,
  nextSceneIndex: chunks.length * 2,
  rollingSummary: "summary",
  bible: { tone: "warm", facts: ["Asha has a red scarf"], characters: [{ name: "Asha", description: "a girl" }] },
  flags: [{ chunkIndex: 0, description: "possible contradiction" }],
  budgetDurationMin: 4,
});

const story = (p: StoryProgress | null): StoredStory => ({
  mode: "idea",
  rawInput: "A girl finds a lamp",
  gatekeeper: null,
  outline: { title: "The Lamp", logline: "", scenes: [] },
  progress: p,
});

beforeEach(() => {
  db = new StudioDatabase(`avs-story-${Math.random().toString(36).slice(2)}`);
  clock = 1_000;
  store = new StoryStore(db, { now: () => clock });
});

afterEach(async () => {
  await db.delete();
});

describe("StoryStore", () => {
  it("returns undefined for an unknown project", async () => {
    expect(await store.load("nope")).toBeUndefined();
  });

  it("saves and loads a story with its progress", async () => {
    const saved = story(progress([chunk(0, "one two three"), chunk(1, "four five")]));
    await store.save("p1", saved);

    expect(await store.load("p1")).toEqual(saved);
  });

  it("saves a story without progress", async () => {
    await store.save("p1", story(null));
    expect(await store.load("p1")).toEqual(story(null));
  });

  it("keeps the creation time of chunks that were already saved", async () => {
    await store.save("p1", story(progress([chunk(0, "one two")])));
    clock = 2_000;
    await store.save("p1", story(progress([chunk(0, "one two"), chunk(1, "three four")])));

    const record = await db.stories.get("p1");
    expect(record?.chunks.map((c) => [c.index, c.createdAt])).toEqual([
      [0, 1_000],
      [1, 2_000],
    ]);
  });

  it("detects damaged saved progress", async () => {
    await store.save("p1", story(progress([chunk(0, "one two")])));
    await db.stories.update("p1", { storyBible: { unexpected: true } });

    await expect(store.load("p1")).rejects.toMatchObject({ code: "storage.story_corrupt" });
  });

  it("detects a missing chunk text", async () => {
    await store.save("p1", story(progress([chunk(0, "one two")])));
    await db.stories.update("p1", { chunks: [] });

    await expect(store.load("p1")).rejects.toMatchObject({ code: "storage.story_corrupt" });
  });

  it("provides a progress saver for the engine", async () => {
    const save = store.progressSaver("p1", {
      mode: "full",
      rawInput: "pasted story",
      gatekeeper: null,
      outline: null,
    });
    await save(progress([chunk(0, "one two")]));

    const loaded = await store.load("p1");
    expect(loaded?.mode).toBe("full");
    expect(loaded?.progress?.chunks).toHaveLength(1);
  });
});

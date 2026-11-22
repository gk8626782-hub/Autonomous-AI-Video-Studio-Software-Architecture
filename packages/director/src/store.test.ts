import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProfile } from "@avs/genre";
import { StudioDatabase } from "@avs/storage";
import { planDirector } from "./plan";
import { DirectorStore } from "./store";
import type { DirectorInput } from "./types";

let db: StudioDatabase;
let store: DirectorStore;

const baseInput = (projectId: string, sceneCount: number): DirectorInput => ({
  projectId,
  language: "en",
  profile: resolveProfile({ genre: "cartoon", tradition: null }),
  characters: [
    { id: "c-asha", name: "Asha" },
    { id: "c-ravi", name: "Ravi" },
  ],
  environments: [{ id: "e-village", name: "Village" }],
  scenes: Array.from({ length: sceneCount }, (_unused, index) => ({
    index,
    title: `Scene ${index}`,
    summary: `Summary ${index}`,
    targetSec: 30,
    location: "Village",
    characters: ["Asha", "Ravi"],
    text: "Asha: Hello there.\nRavi: Hello, Asha.\nThe day began.",
  })),
});

beforeEach(() => {
  db = new StudioDatabase(`avs-director-${Math.random().toString(36).slice(2)}`);
  store = new DirectorStore(db);
});

afterEach(async () => {
  await db.delete();
});

describe("DirectorStore", () => {
  it("saves scenes and shots and loads them back in order", async () => {
    const plan = planDirector(baseInput("p1", 2));
    await store.save(plan);

    const { scenes, shots } = await store.load("p1");
    expect(scenes.map((scene) => scene.index)).toEqual([0, 1]);
    expect(scenes[0]).toMatchObject({
      id: "scene:p1:0",
      projectId: "p1",
      summary: "Summary 0",
      environmentId: "e-village",
      status: "pending",
      cacheKey: null,
    });
    expect(scenes[0]?.dialogue).toEqual([
      { characterId: "c-asha", text: "Hello there." },
      { characterId: "c-ravi", text: "Hello, Asha." },
    ]);

    const planned = plan.scenes.reduce((total, scene) => total + scene.shots.length, 0);
    expect(shots).toHaveLength(planned);
    expect(shots[0]).toMatchObject({ projectId: "p1", sceneId: "scene:p1:0", clipRef: null });
    expect(shots[0]?.plan).toEqual(plan.scenes[0]?.shots[0]);
  });

  it("replaces the earlier plan of the project and leaves other projects alone", async () => {
    await store.save(planDirector(baseInput("p1", 3)));
    await store.save(planDirector(baseInput("p2", 1)));
    await store.save(planDirector(baseInput("p1", 1)));

    const first = await store.load("p1");
    const second = await store.load("p2");

    expect(first.scenes).toHaveLength(1);
    expect(first.shots.every((shot) => shot.sceneId === "scene:p1:0")).toBe(true);
    expect(second.scenes).toHaveLength(1);
    expect(second.shots.length).toBeGreaterThan(0);
  });

  it("returns nothing for a project without a plan", async () => {
    expect(await store.load("none")).toEqual({ scenes: [], shots: [] });
  });
});

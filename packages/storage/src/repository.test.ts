import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { ProjectRepository, StudioDatabase, type MediaRefRecord } from "./index";

let db: StudioDatabase;
let repo: ProjectRepository;
let clock: number;
let counter: number;

beforeEach(() => {
  db = new StudioDatabase(`avs-test-${Math.random().toString(36).slice(2)}`);
  clock = 1_000;
  counter = 0;
  repo = new ProjectRepository(db, {
    now: () => ++clock,
    newId: () => `id-${++counter}`,
  });
});

afterEach(async () => {
  await db.delete();
});

describe("ProjectRepository", () => {
  it("creates a project with defaults", async () => {
    const project = await repo.create({ title: "  My film  ", language: "hi", durationMinTarget: 30 });

    expect(project.title).toBe("My film");
    expect(project.status).toBe("draft");
    expect(project.genreProfileId).toBeNull();
    expect(project.aspectRatios).toEqual(["9:16", "16:9"]);
    expect(await repo.get(project.id)).toEqual(project);
  });

  it("lists newest updated first", async () => {
    const a = await repo.create({ title: "A", language: "en", durationMinTarget: 5 });
    const b = await repo.create({ title: "B", language: "en", durationMinTarget: 5 });
    await repo.update(a.id, { title: "A2" });

    const ids = (await repo.list()).map((p) => p.id);
    expect(ids).toEqual([a.id, b.id]);
  });

  it("rejects invalid input with a validation AppError", async () => {
    await expect(repo.create({ title: " ", language: "hi", durationMinTarget: 10 })).rejects.toMatchObject({
      code: "validation.invalid_title",
      category: "validation",
    });
    await expect(repo.create({ title: "x", language: "hi", durationMinTarget: 0 })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(
      repo.create({ title: "x", language: "hi", durationMinTarget: 10, aspectRatios: [] }),
    ).rejects.toMatchObject({ code: "validation.invalid_aspect_ratios" });
  });

  it("updates fields and bumps updatedAt", async () => {
    const project = await repo.create({ title: "A", language: "en", durationMinTarget: 5 });
    const updated = await repo.update(project.id, { title: "B", status: "planning", durationMinTarget: 45 });

    expect(updated.title).toBe("B");
    expect(updated.status).toBe("planning");
    expect(updated.durationMinTarget).toBe(45);
    expect(updated.updatedAt).toBeGreaterThan(project.updatedAt);
    expect(await repo.get(project.id)).toEqual(updated);
  });

  it("throws when updating a missing project", async () => {
    await expect(repo.update("missing", { title: "x" })).rejects.toMatchObject({
      code: "storage.project_not_found",
    });
  });

  it("removes a project with all related records and returns media paths", async () => {
    const project = await repo.create({ title: "A", language: "en", durationMinTarget: 5 });
    const other = await repo.create({ title: "Other", language: "en", durationMinTarget: 5 });
    const pid = project.id;

    const media: MediaRefRecord = {
      id: "m1",
      projectId: pid,
      kind: "image",
      opfsPath: `projects/${pid}/media/m1.png`,
      driveFileId: null,
      sha256: "abc",
      hashKind: "full",
      bytes: 10,
      mime: "image/png",
      width: null,
      height: null,
      durationMs: null,
      origin: "upload",
      providerJobId: null,
      status: "ok",
      createdAt: 1,
    };

    await db.mediaRefs.add(media);
    await db.syncState.add({ mediaRefId: "m1", status: "pending", driveFileId: null, lastAttemptAt: null, error: null });
    await db.stories.add({
      projectId: pid,
      mode: "idea",
      rawInput: "x",
      gatekeeperResult: null,
      outline: null,
      storyBible: null,
      chunks: [],
    });
    await db.scenes.add({
      id: "s1",
      projectId: pid,
      index: 0,
      summary: "",
      characterIds: [],
      environmentId: null,
      dialogue: [],
      status: "pending",
      cacheKey: null,
    });
    await db.jobs.add({
      id: "j1",
      projectId: pid,
      type: "test",
      payload: null,
      state: "queued",
      attempts: 0,
      providerJobId: null,
      idempotencyKey: "k1",
      error: null,
      nextRunAt: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await db.edl.add({ projectId: pid, version: 1, tracks: [], profileVersion: 1 });

    const paths = await repo.remove(pid);

    expect(paths).toEqual([`projects/${pid}/media/m1.png`]);
    expect(await repo.get(pid)).toBeUndefined();
    expect(await db.mediaRefs.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
    expect(await db.stories.count()).toBe(0);
    expect(await db.scenes.count()).toBe(0);
    expect(await db.jobs.count()).toBe(0);
    expect(await db.edl.count()).toBe(0);
    expect(await repo.get(other.id)).toBeDefined();
  });
});

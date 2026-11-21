import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaService, MemoryFileStore, StudioDatabase } from "./index";

const HELLO_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

let db: StudioDatabase;
let files: MemoryFileStore;
let media: MediaService;
let counter: number;

const meta = {
  projectId: "p1",
  kind: "image" as const,
  origin: "upload" as const,
  mime: "image/png",
  extension: "png",
};

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  db = new StudioDatabase(`avs-media-${Math.random().toString(36).slice(2)}`);
  files = new MemoryFileStore();
  counter = 0;
  media = new MediaService(db, files, { now: () => 1234, newId: () => `m${++counter}` });
});

afterEach(async () => {
  await db.delete();
});

describe("MediaService", () => {
  it("copies a blob into private storage and records it", async () => {
    const record = await media.ingest(new Blob(["hello"]), meta);

    expect(record).toMatchObject({
      id: "m1",
      projectId: "p1",
      opfsPath: "projects/p1/media/m1.png",
      bytes: 5,
      sha256: HELLO_SHA256,
      hashKind: "full",
      status: "ok",
      origin: "upload",
      createdAt: 1234,
    });
    expect(await files.exists("projects/p1/media/m1.png")).toBe(true);
    expect(await db.mediaRefs.get("m1")).toEqual(record);
  });

  it("streams provider output straight into storage", async () => {
    const record = await media.ingest(streamOf("hel", "lo"), { ...meta, origin: "ai", kind: "clip", extension: ".MP4" });

    expect(record.opfsPath).toBe("projects/p1/media/m1.mp4");
    expect(record.bytes).toBe(5);
    expect(record.sha256).toBe(HELLO_SHA256);
    expect(record.origin).toBe("ai");
  });

  it("rejects unsafe extensions without writing anything", async () => {
    await expect(media.ingest(new Blob(["x"]), { ...meta, extension: "../x" })).rejects.toMatchObject({
      code: "validation.invalid_extension",
    });
    expect(await db.mediaRefs.count()).toBe(0);
  });

  it("detects a missing file", async () => {
    const record = await media.ingest(new Blob(["hello"]), meta);
    await files.remove(record.opfsPath);

    expect((await media.verify(record.id)).status).toBe("missing");
    expect((await db.mediaRefs.get(record.id))?.status).toBe("missing");
  });

  it("detects a file with a different size", async () => {
    const record = await media.ingest(new Blob(["hello"]), meta);
    await files.write(record.opfsPath, new Blob(["different length"]));

    expect((await media.verify(record.id)).status).toBe("corrupt");
  });

  it("detects same-size corruption only with a deep check", async () => {
    const record = await media.ingest(new Blob(["hello"]), meta);
    await files.write(record.opfsPath, new Blob(["world"]));

    expect((await media.verify(record.id)).status).toBe("ok");
    expect((await media.verify(record.id, { deep: true })).status).toBe("corrupt");
  });

  it("recovers the status when a file comes back", async () => {
    const record = await media.ingest(new Blob(["hello"]), meta);
    await files.remove(record.opfsPath);
    await media.verify(record.id);

    await files.write(record.opfsPath, new Blob(["hello"]));
    expect((await media.verify(record.id)).status).toBe("ok");
  });

  it("keeps the syncing status while the file is healthy", async () => {
    const record = await media.ingest(new Blob(["hello"]), meta);
    await db.mediaRefs.update(record.id, { status: "syncing" });

    expect((await media.verify(record.id)).status).toBe("syncing");
  });

  it("reports only broken files for a project", async () => {
    const a = await media.ingest(new Blob(["aaa"]), meta);
    const b = await media.ingest(new Blob(["bbb"]), meta);
    await media.ingest(new Blob(["ccc"]), { ...meta, projectId: "p2" });
    await files.remove(b.opfsPath);

    const problems = await media.verifyProject("p1");
    expect(problems.map((record) => record.id)).toEqual([b.id]);
    expect(a.id).not.toBe(b.id);
  });

  it("throws for an unknown id", async () => {
    await expect(media.verify("nope")).rejects.toMatchObject({ code: "media.not_found" });
  });

  it("removes the file, record and sync state", async () => {
    const record = await media.ingest(new Blob(["hello"]), meta);
    await db.syncState.add({
      mediaRefId: record.id,
      status: "pending",
      driveFileId: null,
      lastAttemptAt: null,
      error: null,
    });

    await media.remove(record.id);

    expect(await files.exists(record.opfsPath)).toBe(false);
    expect(await db.mediaRefs.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
  });
});

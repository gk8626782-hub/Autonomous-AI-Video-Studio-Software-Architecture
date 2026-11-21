import { describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { MemoryFileStore, normalizePath } from "./file-store";

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

describe("normalizePath", () => {
  it("accepts clean relative paths", () => {
    expect(normalizePath("projects/p1/media/a.png")).toBe("projects/p1/media/a.png");
  });

  it.each(["", "/abs", "a//b", "a/../b", "./a", "a/", "a\\b", "a/\0/b"])("rejects %j", (path) => {
    expect(() => normalizePath(path)).toThrowError(AppError);
  });
});

describe("MemoryFileStore", () => {
  it("writes, reads and reports size", async () => {
    const store = new MemoryFileStore();
    expect(await store.write("a/b.txt", new TextEncoder().encode("hello"))).toBe(5);

    expect(await store.exists("a/b.txt")).toBe(true);
    expect(await store.size("a/b.txt")).toBe(5);
    expect(await (await store.read("a/b.txt"))!.text()).toBe("hello");
  });

  it("writes blobs and replaces existing files", async () => {
    const store = new MemoryFileStore();
    await store.write("f.txt", new Blob(["one"]));
    await store.write("f.txt", new Blob(["three"]));
    expect(await (await store.read("f.txt"))!.text()).toBe("three");
  });

  it("streams data into a file", async () => {
    const store = new MemoryFileStore();
    expect(await store.writeStream("s.txt", streamOf("hel", "lo"))).toBe(5);
    expect(await (await store.read("s.txt"))!.text()).toBe("hello");
  });

  it("returns null for missing files", async () => {
    const store = new MemoryFileStore();
    expect(await store.read("nope.txt")).toBeNull();
    expect(await store.size("nope.txt")).toBeNull();
    expect(await store.exists("nope.txt")).toBe(false);
  });

  it("removes files and whole directories", async () => {
    const store = new MemoryFileStore();
    await store.write("projects/p1/a.txt", new Blob(["a"]));
    await store.write("projects/p1/sub/b.txt", new Blob(["b"]));
    await store.write("projects/p10/c.txt", new Blob(["c"]));

    await store.remove("projects/p1/a.txt");
    expect(await store.exists("projects/p1/a.txt")).toBe(false);

    await store.removeDirectory("projects/p1");
    expect(await store.exists("projects/p1/sub/b.txt")).toBe(false);
    expect(await store.exists("projects/p10/c.txt")).toBe(true);
  });
});

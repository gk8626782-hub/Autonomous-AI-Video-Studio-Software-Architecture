import { AppError } from "@avs/core";

/**
 * Binary file storage abstraction. The browser implementation uses OPFS
 * (private to the origin, invisible in the gallery and file manager).
 * The in-memory implementation is used by tests.
 */
export interface FileStore {
  write(path: string, data: Blob | Uint8Array): Promise<number>;
  /** Streams data straight into storage without holding the whole file in memory. */
  writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<number>;
  read(path: string): Promise<Blob | null>;
  size(path: string): Promise<number | null>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  /** Removes a directory and everything below it. */
  removeDirectory(path: string): Promise<void>;
}

/** Rejects empty segments, "." and "..", backslashes and NUL characters. */
export function normalizePath(path: string): string {
  const segments = path.split("/");
  const valid = segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== ".." &&
      !segment.includes("\\") &&
      !segment.includes("\0"),
  );
  if (!valid) {
    throw new AppError({
      code: "storage.invalid_path",
      category: "storage",
      messageKey: "error.storage.invalidPath",
      message: `Invalid storage path: ${path}`,
      recoverable: false,
    });
  }
  return segments.join("/");
}

/** Same reason as in the crypto package: one place for the typed-array cast. */
function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes as unknown as BlobPart;
}

export class MemoryFileStore implements FileStore {
  private readonly files = new Map<string, Blob>();

  async write(path: string, data: Blob | Uint8Array): Promise<number> {
    const key = normalizePath(path);
    const blob = data instanceof Blob ? data.slice() : new Blob([toBlobPart(data)]);
    this.files.set(key, blob);
    return blob.size;
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<number> {
    const key = normalizePath(path);
    const parts: BlobPart[] = [];
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        parts.push(toBlobPart(value));
      }
    } finally {
      reader.releaseLock();
    }
    const blob = new Blob(parts);
    this.files.set(key, blob);
    return blob.size;
  }

  async read(path: string): Promise<Blob | null> {
    return this.files.get(normalizePath(path)) ?? null;
  }

  async size(path: string): Promise<number | null> {
    return this.files.get(normalizePath(path))?.size ?? null;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(normalizePath(path));
  }

  async remove(path: string): Promise<void> {
    this.files.delete(normalizePath(path));
  }

  async removeDirectory(path: string): Promise<void> {
    const prefix = `${normalizePath(path)}/`;
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
  }
}

interface WritableLike {
  write(data: BlobPart): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface WritableFileHandle {
  createWritable?: () => Promise<WritableLike>;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "TypeMismatchError")
  );
}

function writeUnsupported(): AppError {
  return new AppError({
    code: "storage.opfs_write_unsupported",
    category: "storage",
    messageKey: "error.storage.opfsWriteUnsupported",
    message: "This browser cannot write files to private storage from the main thread",
    recoverable: false,
  });
}

/**
 * OPFS-backed store. Writes go through a temporary swap file, so an aborted
 * or failed write never leaves a half-written file behind.
 * Browsers without createWritable (some Safari versions) need a worker-based
 * writer, which is planned as a later addition.
 */
export class OpfsFileStore implements FileStore {
  constructor(
    private readonly getRoot: () => Promise<FileSystemDirectoryHandle> = () =>
      navigator.storage.getDirectory(),
  ) {}

  async write(path: string, data: Blob | Uint8Array): Promise<number> {
    const writable = await this.openWritable(path);
    try {
      await writable.write(data instanceof Blob ? data : toBlobPart(data));
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return data instanceof Blob ? data.size : data.byteLength;
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<number> {
    const writable = await this.openWritable(path);
    const reader = stream.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await writable.write(toBlobPart(value));
        total += value.byteLength;
      }
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    return total;
  }

  async read(path: string): Promise<Blob | null> {
    const location = await this.find(path);
    if (location === null) {
      return null;
    }
    try {
      const handle = await location.dir.getFileHandle(location.name);
      return await handle.getFile();
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async size(path: string): Promise<number | null> {
    return (await this.read(path))?.size ?? null;
  }

  async exists(path: string): Promise<boolean> {
    return (await this.read(path)) !== null;
  }

  async remove(path: string): Promise<void> {
    const location = await this.find(path);
    if (location === null) {
      return;
    }
    try {
      await location.dir.removeEntry(location.name);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  async removeDirectory(path: string): Promise<void> {
    const segments = normalizePath(path).split("/");
    const name = segments.pop() as string;
    const parent = await this.resolve(segments, false);
    if (parent === null) {
      return;
    }
    try {
      await parent.removeEntry(name, { recursive: true });
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  private async openWritable(path: string): Promise<WritableLike> {
    const segments = normalizePath(path).split("/");
    const name = segments.pop() as string;
    const dir = await this.resolve(segments, true);
    if (dir === null) {
      throw writeUnsupported();
    }
    const handle = (await dir.getFileHandle(name, { create: true })) as unknown as WritableFileHandle;
    if (typeof handle.createWritable !== "function") {
      throw writeUnsupported();
    }
    return handle.createWritable();
  }

  private async find(path: string): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
    const segments = normalizePath(path).split("/");
    const name = segments.pop() as string;
    const dir = await this.resolve(segments, false);
    return dir === null ? null : { dir, name };
  }

  private async resolve(
    segments: readonly string[],
    create: boolean,
  ): Promise<FileSystemDirectoryHandle | null> {
    let dir = await this.getRoot();
    for (const segment of segments) {
      try {
        dir = await dir.getDirectoryHandle(segment, { create });
      } catch (error) {
        if (!create && isNotFound(error)) {
          return null;
        }
        throw error;
      }
    }
    return dir;
  }
}

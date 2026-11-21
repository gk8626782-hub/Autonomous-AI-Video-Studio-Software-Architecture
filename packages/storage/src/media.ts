import { AppError } from "@avs/core";
import type { StudioDatabase } from "./db";
import type { FileStore } from "./file-store";
import { computeFingerprint } from "./fingerprint";
import type { MediaKind, MediaOrigin, MediaRefRecord, MediaStatus } from "./types";

export type MediaSource = Blob | ReadableStream<Uint8Array>;

export interface IngestMeta {
  projectId: string;
  kind: MediaKind;
  origin: MediaOrigin;
  mime: string;
  /** File extension without dot, for example "png". */
  extension: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  providerJobId?: string | null;
}

export interface VerifyOptions {
  /** Re-hash the file content. Slower, but catches same-size corruption. */
  deep?: boolean;
}

export interface MediaServiceOptions {
  readonly now?: () => number;
  readonly newId?: () => string;
}

const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

function sanitizeExtension(value: string): string {
  const extension = value.trim().replace(/^\./, "").toLowerCase();
  if (!EXTENSION_PATTERN.test(extension)) {
    throw new AppError({
      code: "validation.invalid_extension",
      category: "validation",
      messageKey: "error.validation.extension",
      message: "File extension must be 1-8 letters or digits",
      recoverable: true,
      details: { field: "extension" },
    });
  }
  return extension;
}

function mediaError(code: string, message: string, details?: Record<string, unknown>): AppError {
  return new AppError({
    code: `media.${code}`,
    category: "media",
    messageKey: `error.media.${code}`,
    message,
    recoverable: false,
    ...(details === undefined ? {} : { details }),
  });
}

/**
 * Copies media into private storage and keeps one MediaRef per file.
 * Because every file is copied in, a gallery deletion can never break a project.
 * A file can still go missing (storage eviction, cleared site data), which
 * verify() detects so the UI can show the red Missing Media alert.
 */
export class MediaService {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(
    private readonly db: StudioDatabase,
    private readonly files: FileStore,
    options: MediaServiceOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  async ingest(source: MediaSource, meta: IngestMeta): Promise<MediaRefRecord> {
    const extension = sanitizeExtension(meta.extension);
    const id = this.newId();
    const opfsPath = `projects/${meta.projectId}/media/${id}.${extension}`;

    const bytes =
      source instanceof Blob
        ? await this.files.write(opfsPath, source)
        : await this.files.writeStream(opfsPath, source);

    const stored = await this.files.read(opfsPath);
    if (stored === null || stored.size !== bytes) {
      await this.files.remove(opfsPath);
      throw mediaError("write_failed", "Stored file does not match the written data", { id });
    }

    const fingerprint = await computeFingerprint(stored);
    const record: MediaRefRecord = {
      id,
      projectId: meta.projectId,
      kind: meta.kind,
      opfsPath,
      driveFileId: null,
      sha256: fingerprint.sha256,
      hashKind: fingerprint.hashKind,
      bytes,
      mime: meta.mime,
      width: meta.width ?? null,
      height: meta.height ?? null,
      durationMs: meta.durationMs ?? null,
      origin: meta.origin,
      providerJobId: meta.providerJobId ?? null,
      status: "ok",
      createdAt: this.now(),
    };

    try {
      await this.db.mediaRefs.add(record);
    } catch (error) {
      await this.files.remove(opfsPath);
      throw error;
    }
    return record;
  }

  /** Checks one file and persists the resulting status. */
  async verify(id: string, options: VerifyOptions = {}): Promise<MediaRefRecord> {
    const record = await this.db.mediaRefs.get(id);
    if (record === undefined) {
      throw mediaError("not_found", `Media not found: ${id}`, { id });
    }

    const blob = await this.files.read(record.opfsPath);
    let next: MediaStatus;
    if (blob === null) {
      next = "missing";
    } else if (blob.size !== record.bytes) {
      next = "corrupt";
    } else if (options.deep === true) {
      const fingerprint = await computeFingerprint(blob);
      next =
        fingerprint.sha256 === record.sha256 && fingerprint.hashKind === record.hashKind
          ? "ok"
          : "corrupt";
    } else {
      next = "ok";
    }

    // A file that is still being synced stays "syncing" while it is healthy.
    if (record.status === "syncing" && next === "ok") {
      return record;
    }
    if (next !== record.status) {
      await this.db.mediaRefs.update(id, { status: next });
    }
    return { ...record, status: next };
  }

  /** Verifies every file of a project and returns only the broken ones. */
  async verifyProject(projectId: string, options: VerifyOptions = {}): Promise<MediaRefRecord[]> {
    const records = await this.db.mediaRefs.where("projectId").equals(projectId).toArray();
    const checked = await Promise.all(records.map((record) => this.verify(record.id, options)));
    return checked.filter((record) => record.status === "missing" || record.status === "corrupt");
  }

  async remove(id: string): Promise<void> {
    const record = await this.db.mediaRefs.get(id);
    if (record === undefined) {
      return;
    }
    await this.files.remove(record.opfsPath);
    await this.db.transaction("rw", [this.db.mediaRefs, this.db.syncState], async () => {
      await this.db.syncState.delete(id);
      await this.db.mediaRefs.delete(id);
    });
  }
}

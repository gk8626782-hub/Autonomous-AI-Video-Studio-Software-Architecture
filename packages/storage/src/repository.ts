import { AppError } from "@avs/core";
import type { StudioDatabase } from "./db";
import type { AspectRatio, ProjectLanguage, ProjectRecord, ProjectStatus } from "./types";

export const PROJECT_SCHEMA_VERSION = 1;

const MAX_TITLE_LENGTH = 120;
const MIN_DURATION_MIN = 1;
const MAX_DURATION_MIN = 240;
const LANGUAGES: readonly ProjectLanguage[] = ["hi", "en", "hinglish"];
const ASPECT_RATIOS: readonly AspectRatio[] = ["9:16", "16:9"];
const STATUSES: readonly ProjectStatus[] = [
  "draft",
  "planning",
  "generating",
  "editing",
  "rendering",
  "done",
];

export interface NewProjectInput {
  title: string;
  language: ProjectLanguage;
  durationMinTarget: number;
  aspectRatios?: readonly AspectRatio[];
  genreProfileId?: string | null;
}

export type ProjectPatch = Partial<
  Pick<
    ProjectRecord,
    "title" | "language" | "genreProfileId" | "durationMinTarget" | "aspectRatios" | "status"
  >
>;

export interface RepositoryOptions {
  readonly now?: () => number;
  readonly newId?: () => string;
}

function validationError(field: string, message: string): AppError {
  return new AppError({
    code: `validation.invalid_${field}`,
    category: "validation",
    messageKey: `error.validation.${field}`,
    message,
    recoverable: true,
    details: { field },
  });
}

function validateTitle(value: string): string {
  const title = value.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    throw validationError("title", `Title must be 1-${MAX_TITLE_LENGTH} characters`);
  }
  return title;
}

function validateDuration(value: number): number {
  if (!Number.isFinite(value) || value < MIN_DURATION_MIN || value > MAX_DURATION_MIN) {
    throw validationError(
      "duration",
      `Duration must be between ${MIN_DURATION_MIN} and ${MAX_DURATION_MIN} minutes`,
    );
  }
  return value;
}

function validateLanguage(value: ProjectLanguage): ProjectLanguage {
  if (!LANGUAGES.includes(value)) {
    throw validationError("language", "Unsupported language");
  }
  return value;
}

function validateStatus(value: ProjectStatus): ProjectStatus {
  if (!STATUSES.includes(value)) {
    throw validationError("status", "Unsupported status");
  }
  return value;
}

function validateAspectRatios(values: readonly AspectRatio[]): AspectRatio[] {
  const unique = [...new Set(values)];
  if (unique.length === 0 || unique.some((v) => !ASPECT_RATIOS.includes(v))) {
    throw validationError("aspect_ratios", "Choose at least one supported aspect ratio");
  }
  return unique;
}

function notFound(id: string): AppError {
  return new AppError({
    code: "storage.project_not_found",
    category: "storage",
    messageKey: "error.storage.projectNotFound",
    message: `Project not found: ${id}`,
    recoverable: false,
    details: { id },
  });
}

export class ProjectRepository {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(
    private readonly db: StudioDatabase,
    options: RepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  async create(input: NewProjectInput): Promise<ProjectRecord> {
    const timestamp = this.now();
    const record: ProjectRecord = {
      id: this.newId(),
      title: validateTitle(input.title),
      language: validateLanguage(input.language),
      genreProfileId: input.genreProfileId ?? null,
      durationMinTarget: validateDuration(input.durationMinTarget),
      aspectRatios: validateAspectRatios(input.aspectRatios ?? ASPECT_RATIOS),
      status: "draft",
      schemaVersion: PROJECT_SCHEMA_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.db.projects.add(record);
    return record;
  }

  get(id: string): Promise<ProjectRecord | undefined> {
    return this.db.projects.get(id);
  }

  /** Newest updated project first. */
  list(): Promise<ProjectRecord[]> {
    return this.db.projects.orderBy("updatedAt").reverse().toArray();
  }

  async update(id: string, patch: ProjectPatch): Promise<ProjectRecord> {
    const existing = await this.db.projects.get(id);
    if (existing === undefined) {
      throw notFound(id);
    }

    const changes: Partial<ProjectRecord> = {};
    if (patch.title !== undefined) changes.title = validateTitle(patch.title);
    if (patch.language !== undefined) changes.language = validateLanguage(patch.language);
    if (patch.genreProfileId !== undefined) changes.genreProfileId = patch.genreProfileId;
    if (patch.durationMinTarget !== undefined) {
      changes.durationMinTarget = validateDuration(patch.durationMinTarget);
    }
    if (patch.aspectRatios !== undefined) {
      changes.aspectRatios = validateAspectRatios(patch.aspectRatios);
    }
    if (patch.status !== undefined) changes.status = validateStatus(patch.status);
    changes.updatedAt = this.now();

    await this.db.projects.update(id, changes);
    return { ...existing, ...changes };
  }

  /**
   * Deletes a project and every record that belongs to it in one transaction.
   * Returns the OPFS paths of its media so the caller can delete the files.
   */
  async remove(id: string): Promise<string[]> {
    const db = this.db;
    return db.transaction(
      "rw",
      [
        db.projects,
        db.stories,
        db.characters,
        db.environments,
        db.scenes,
        db.shots,
        db.mediaRefs,
        db.jobs,
        db.edl,
        db.syncState,
      ],
      async () => {
        const media = await db.mediaRefs.where("projectId").equals(id).toArray();
        await db.syncState.bulkDelete(media.map((m) => m.id));
        await db.mediaRefs.where("projectId").equals(id).delete();
        await db.shots.where("projectId").equals(id).delete();
        await db.scenes.where("projectId").equals(id).delete();
        await db.characters.where("projectId").equals(id).delete();
        await db.environments.where("projectId").equals(id).delete();
        await db.jobs.where("projectId").equals(id).delete();
        await db.stories.delete(id);
        await db.edl.delete(id);
        await db.projects.delete(id);
        return media.map((m) => m.opfsPath);
      },
    );
  }
}

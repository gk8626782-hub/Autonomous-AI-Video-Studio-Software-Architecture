/**
 * Persisted record types for the local database.
 * Timestamps are epoch milliseconds. Binary assets never live here;
 * they are stored in OPFS and referenced through MediaRefRecord.
 */

export type ProjectLanguage = "hi" | "en" | "hinglish";
export type AspectRatio = "9:16" | "16:9";
export type ProjectStatus =
  | "draft"
  | "planning"
  | "generating"
  | "editing"
  | "rendering"
  | "done";

export interface ProjectRecord {
  id: string;
  title: string;
  language: ProjectLanguage;
  genreProfileId: string | null;
  durationMinTarget: number;
  aspectRatios: AspectRatio[];
  status: ProjectStatus;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export type StoryMode = "idea" | "full";

export interface StoryChunk {
  index: number;
  text: string;
  createdAt: number;
}

export interface StoryRecord {
  /** Primary key. One story per project. */
  projectId: string;
  mode: StoryMode;
  rawInput: string;
  /** Shapes below are validated by schemas introduced in later phases. */
  gatekeeperResult: unknown;
  outline: unknown;
  storyBible: unknown;
  chunks: StoryChunk[];
}

export interface CharacterViewSlots {
  front: string | null;
  left: string | null;
  right: string | null;
  back: string | null;
  threeQuarter: string | null;
}

export interface VoiceSlot {
  mode: "upload" | "ai" | null;
  providerId: string | null;
  voiceId: string | null;
  sampleRef: string | null;
  locked: boolean;
}

/** View slot values and sampleRef are MediaRefRecord ids. */
export interface CharacterRecord {
  id: string;
  projectId: string;
  name: string;
  role: string;
  species: string;
  ageGroup: string;
  gender: string;
  appearance: string;
  voiceTraits: string;
  viewSlots: CharacterViewSlots;
  /** True once the user approved the whole set of views. A locked set cannot be changed. */
  viewsLocked?: boolean;
  voiceSlot: VoiceSlot;
}

export interface EnvironmentRecord {
  id: string;
  projectId: string;
  name: string;
  /** Description used to generate the panorama. */
  description?: string;
  mode: "upload" | "ai" | null;
  /** MediaRefRecord id of the 2:1 equirectangular panorama. */
  panoramaRef: string | null;
  seamScore: number | null;
}

export interface DialogueLine {
  characterId: string;
  text: string;
}

export type SceneStatus = "pending" | "generating" | "ready" | "failed";

export interface SceneRecord {
  id: string;
  projectId: string;
  index: number;
  summary: string;
  characterIds: string[];
  environmentId: string | null;
  dialogue: DialogueLine[];
  status: SceneStatus;
  cacheKey: string | null;
}

export interface ShotRecord {
  id: string;
  sceneId: string;
  projectId: string;
  index: number;
  yaw: number;
  pitch: number;
  fov: number;
  shotType: string;
  durationMs: number;
  motion: string;
  /** MediaRefRecord id of the generated clip. */
  clipRef: string | null;
}

export type MediaKind = "image" | "clip" | "audio" | "panorama" | "segment" | "export";
export type MediaOrigin = "upload" | "ai" | "render";
export type MediaStatus = "ok" | "missing" | "corrupt" | "syncing";
/** "full" means a complete SHA-256. "partial" samples head, middle and tail of large files. */
export type HashKind = "full" | "partial";

export interface MediaRefRecord {
  id: string;
  projectId: string;
  kind: MediaKind;
  /** Path inside OPFS, relative to the origin private root. */
  opfsPath: string;
  driveFileId: string | null;
  sha256: string;
  hashKind: HashKind;
  bytes: number;
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  origin: MediaOrigin;
  providerJobId: string | null;
  status: MediaStatus;
  createdAt: number;
}

export type JobState =
  | "queued"
  | "running"
  | "paused-offline"
  | "retry-wait"
  | "done"
  | "failed";

export interface JobRecord {
  id: string;
  projectId: string;
  type: string;
  payload: unknown;
  state: JobState;
  attempts: number;
  providerJobId: string | null;
  idempotencyKey: string;
  error: { code: string; messageKey: string } | null;
  /** Output of a finished job. Must be JSON-serializable. Media is referenced by MediaRef id. */
  result?: unknown;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface EdlRecord {
  /** Primary key. One edit decision list per project. */
  projectId: string;
  version: number;
  tracks: unknown;
  profileVersion: number;
}

/** Opaque encrypted vault blob. Its layout is owned by the crypto package. */
export interface VaultRecord {
  id: string;
  version: number;
  payload: Uint8Array;
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

export type SyncStatus = "pending" | "uploading" | "synced" | "error";

export interface SyncStateRecord {
  /** Primary key. Equals MediaRefRecord id. */
  mediaRefId: string;
  status: SyncStatus;
  driveFileId: string | null;
  lastAttemptAt: number | null;
  error: string | null;
}

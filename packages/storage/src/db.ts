import Dexie, { type Table } from "dexie";
import type {
  CharacterRecord,
  EdlRecord,
  EnvironmentRecord,
  JobRecord,
  MediaRefRecord,
  ProjectRecord,
  SceneRecord,
  SettingsRecord,
  ShotRecord,
  StoryRecord,
  SyncStateRecord,
  VaultRecord,
} from "./types";

export const DEFAULT_DATABASE_NAME = "avs-studio";

/**
 * Local IndexedDB database. Metadata only; binary assets live in OPFS.
 * Schema changes must be added as a new version() with an upgrade path.
 */
export class StudioDatabase extends Dexie {
  declare projects: Table<ProjectRecord, string>;
  declare stories: Table<StoryRecord, string>;
  declare characters: Table<CharacterRecord, string>;
  declare environments: Table<EnvironmentRecord, string>;
  declare scenes: Table<SceneRecord, string>;
  declare shots: Table<ShotRecord, string>;
  declare mediaRefs: Table<MediaRefRecord, string>;
  declare jobs: Table<JobRecord, string>;
  declare edl: Table<EdlRecord, string>;
  declare vault: Table<VaultRecord, string>;
  declare settings: Table<SettingsRecord, string>;
  declare syncState: Table<SyncStateRecord, string>;

  constructor(name: string = DEFAULT_DATABASE_NAME) {
    super(name);

    this.version(1).stores({
      projects: "id, updatedAt, status",
      stories: "projectId",
      characters: "id, projectId",
      environments: "id, projectId",
      scenes: "id, projectId, [projectId+index]",
      shots: "id, sceneId, projectId",
      mediaRefs: "id, projectId, kind, status, sha256",
      jobs: "id, projectId, state, nextRunAt",
      edl: "projectId",
      vault: "id",
      settings: "key",
      syncState: "mediaRefId, status",
    });
  }
}

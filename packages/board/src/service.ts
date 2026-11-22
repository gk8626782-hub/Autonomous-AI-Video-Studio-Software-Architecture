import type {
  CharacterRecord,
  EnvironmentRecord,
  MediaKind,
  MediaRefRecord,
  MediaStatus,
  StudioDatabase,
} from "@avs/storage";
import {
  REQUIRED_VIEWS,
  boardError,
  bindClonedVoice,
  emptyViewSlots,
  emptyVoiceSlot,
  lockVoice,
  missingViews,
  setAiVoice,
  setUploadedVoice,
  setView,
  unlockVoice,
} from "./slots";
import type { CharacterView } from "./slots";

export interface CharacterDraft {
  readonly name: string;
  readonly role: string;
  readonly species: string;
  readonly ageGroup: string;
  readonly gender: string;
  readonly appearance: string;
  readonly voiceTraits: string;
}

export interface EnvironmentDraft {
  readonly name: string;
  readonly description: string;
}

export interface BoardServiceOptions {
  readonly newId?: () => string;
}

export interface LoadedBoard {
  readonly characters: CharacterRecord[];
  readonly environments: EnvironmentRecord[];
  /** Status of every media file used by a slot, as last verified. */
  readonly mediaStatus: Map<string, MediaStatus>;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function newer(existing: string, incoming: string): string {
  return incoming !== "" ? incoming : existing;
}

/**
 * Stores the slots of the 360 board: one set of view slots and one voice slot
 * per character, and one panorama slot per environment.
 */
export class BoardService {
  private readonly newId: () => string;

  constructor(
    private readonly db: StudioDatabase,
    options: BoardServiceOptions = {},
  ) {
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  // ---- characters ----

  async listCharacters(projectId: string): Promise<CharacterRecord[]> {
    const records = await this.db.characters.where("projectId").equals(projectId).toArray();
    return records.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Creates slots for new characters found in the story. Existing characters
   * keep their slots and locks; their description is refreshed only while
   * their views are not locked.
   */
  async syncCharacters(projectId: string, drafts: readonly CharacterDraft[]): Promise<CharacterRecord[]> {
    await this.db.transaction("rw", this.db.characters, async () => {
      const existing = await this.db.characters.where("projectId").equals(projectId).toArray();
      const byName = new Map(existing.map((record) => [normalizeName(record.name), record] as const));

      for (const draft of drafts) {
        const key = normalizeName(draft.name);
        const current = byName.get(key);

        if (current === undefined) {
          const record: CharacterRecord = {
            id: this.newId(),
            projectId,
            name: draft.name.trim(),
            role: draft.role,
            species: draft.species,
            ageGroup: draft.ageGroup,
            gender: draft.gender,
            appearance: draft.appearance,
            voiceTraits: draft.voiceTraits,
            viewSlots: emptyViewSlots(),
            voiceSlot: emptyVoiceSlot(),
            viewsLocked: false,
          };
          await this.db.characters.add(record);
          byName.set(key, record);
        } else if (current.viewsLocked !== true) {
          await this.db.characters.update(current.id, {
            role: newer(current.role, draft.role),
            species: newer(current.species, draft.species),
            ageGroup: newer(current.ageGroup, draft.ageGroup),
            gender: newer(current.gender, draft.gender),
            appearance: newer(current.appearance, draft.appearance),
            voiceTraits: newer(current.voiceTraits, draft.voiceTraits),
          });
        }
      }
    });
    return this.listCharacters(projectId);
  }

  async removeCharacter(characterId: string): Promise<void> {
    await this.db.characters.delete(characterId);
  }

  async setCharacterView(characterId: string, view: CharacterView, mediaId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    this.assertViewsUnlocked(character);
    await this.requireMedia(mediaId, character.projectId, "image");
    return this.patchCharacter(character, { viewSlots: setView(character.viewSlots, view, mediaId) });
  }

  async clearCharacterView(characterId: string, view: CharacterView): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    this.assertViewsUnlocked(character);
    return this.patchCharacter(character, { viewSlots: setView(character.viewSlots, view, null) });
  }

  /** Approves the set. Every required angle must be filled first. */
  async lockViews(characterId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    const missing = missingViews(character.viewSlots);
    if (missing.length > 0) {
      throw boardError("views_incomplete", `Missing views: ${missing.join(", ")}`, { missing });
    }
    return this.patchCharacter(character, { viewsLocked: true });
  }

  async unlockViews(characterId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    return this.patchCharacter(character, { viewsLocked: false });
  }

  async setVoiceAi(characterId: string, providerId: string, voiceId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    return this.patchCharacter(character, { voiceSlot: setAiVoice(character.voiceSlot, providerId, voiceId) });
  }

  async setVoiceUpload(characterId: string, sampleMediaId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    await this.requireMedia(sampleMediaId, character.projectId, "audio");
    return this.patchCharacter(character, {
      voiceSlot: setUploadedVoice(character.voiceSlot, sampleMediaId),
    });
  }

  async bindClonedVoice(characterId: string, providerId: string, voiceId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    return this.patchCharacter(character, {
      voiceSlot: bindClonedVoice(character.voiceSlot, providerId, voiceId),
    });
  }

  async lockVoice(characterId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    return this.patchCharacter(character, { voiceSlot: lockVoice(character.voiceSlot) });
  }

  async unlockVoice(characterId: string): Promise<CharacterRecord> {
    const character = await this.requireCharacter(characterId);
    return this.patchCharacter(character, { voiceSlot: unlockVoice(character.voiceSlot) });
  }

  // ---- environments ----

  async listEnvironments(projectId: string): Promise<EnvironmentRecord[]> {
    const records = await this.db.environments.where("projectId").equals(projectId).toArray();
    return records.sort((a, b) => a.name.localeCompare(b.name));
  }

  async syncEnvironments(projectId: string, drafts: readonly EnvironmentDraft[]): Promise<EnvironmentRecord[]> {
    await this.db.transaction("rw", this.db.environments, async () => {
      const existing = await this.db.environments.where("projectId").equals(projectId).toArray();
      const byName = new Map(existing.map((record) => [normalizeName(record.name), record] as const));

      for (const draft of drafts) {
        const key = normalizeName(draft.name);
        const current = byName.get(key);
        if (current === undefined) {
          const record: EnvironmentRecord = {
            id: this.newId(),
            projectId,
            name: draft.name.trim(),
            description: draft.description,
            mode: null,
            panoramaRef: null,
            seamScore: null,
          };
          await this.db.environments.add(record);
          byName.set(key, record);
        } else if (current.panoramaRef === null) {
          await this.db.environments.update(current.id, {
            description: newer(current.description ?? "", draft.description),
          });
        }
      }
    });
    return this.listEnvironments(projectId);
  }

  async removeEnvironment(environmentId: string): Promise<void> {
    await this.db.environments.delete(environmentId);
  }

  /** Stores a checked panorama. seamScore comes from the panorama report. */
  async setPanorama(
    environmentId: string,
    mediaId: string,
    info: { readonly mode: "upload" | "ai"; readonly seamScore: number },
  ): Promise<EnvironmentRecord> {
    const environment = await this.requireEnvironment(environmentId);
    await this.requireMedia(mediaId, environment.projectId, "panorama");

    const changes: Partial<EnvironmentRecord> = {
      mode: info.mode,
      panoramaRef: mediaId,
      seamScore: info.seamScore,
    };
    await this.db.environments.update(environmentId, changes);
    return { ...environment, ...changes };
  }

  async clearPanorama(environmentId: string): Promise<EnvironmentRecord> {
    const environment = await this.requireEnvironment(environmentId);
    const changes: Partial<EnvironmentRecord> = { mode: null, panoramaRef: null, seamScore: null };
    await this.db.environments.update(environmentId, changes);
    return { ...environment, ...changes };
  }

  // ---- reading the whole board ----

  /**
   * Loads slots and the last known status of every media file they use.
   * Run MediaService.verifyProject first for fresh statuses.
   */
  async loadBoard(projectId: string): Promise<LoadedBoard> {
    const characters = await this.listCharacters(projectId);
    const environments = await this.listEnvironments(projectId);

    const ids = new Set<string>();
    for (const character of characters) {
      for (const mediaId of Object.values(character.viewSlots)) {
        if (mediaId !== null) {
          ids.add(mediaId);
        }
      }
      if (character.voiceSlot.sampleRef !== null) {
        ids.add(character.voiceSlot.sampleRef);
      }
    }
    for (const environment of environments) {
      if (environment.panoramaRef !== null) {
        ids.add(environment.panoramaRef);
      }
    }

    const list = [...ids];
    const records = await this.db.mediaRefs.bulkGet(list);
    const mediaStatus = new Map<string, MediaStatus>();
    records.forEach((record, index) => {
      const id = list[index];
      if (record !== undefined && id !== undefined) {
        mediaStatus.set(id, record.status);
      }
    });

    return { characters, environments, mediaStatus };
  }

  // ---- helpers ----

  private async requireCharacter(id: string): Promise<CharacterRecord> {
    const record = await this.db.characters.get(id);
    if (record === undefined) {
      throw boardError("character_not_found", `Character not found: ${id}`, { id });
    }
    return record;
  }

  private async requireEnvironment(id: string): Promise<EnvironmentRecord> {
    const record = await this.db.environments.get(id);
    if (record === undefined) {
      throw boardError("environment_not_found", `Environment not found: ${id}`, { id });
    }
    return record;
  }

  private async requireMedia(mediaId: string, projectId: string, kind: MediaKind): Promise<MediaRefRecord> {
    const media = await this.db.mediaRefs.get(mediaId);
    if (
      media === undefined ||
      media.projectId !== projectId ||
      media.kind !== kind ||
      media.status !== "ok"
    ) {
      throw boardError("invalid_media", `Media ${mediaId} is not a usable ${kind} of this project`, {
        mediaId,
        kind,
      });
    }
    return media;
  }

  private assertViewsUnlocked(character: CharacterRecord): void {
    if (character.viewsLocked === true) {
      throw boardError("views_locked", "Unlock the views before changing them", { id: character.id });
    }
  }

  private async patchCharacter(
    character: CharacterRecord,
    changes: Partial<CharacterRecord>,
  ): Promise<CharacterRecord> {
    await this.db.characters.update(character.id, changes);
    return { ...character, ...changes };
  }
}

export { REQUIRED_VIEWS };

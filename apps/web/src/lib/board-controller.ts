"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppError, ValidationRegistry } from "@avs/core";
import { BoardValidation, extensionForMime, preparePanorama } from "@avs/board";
import type { BoardSnapshot, CharacterView, PanoramaIssue } from "@avs/board";
import { errorMessage } from "@avs/i18n";
import { assessStorage, readStorageEstimate, requestPersistence } from "@avs/storage";
import type { ProjectRecord } from "@avs/storage";
import { useAppStore } from "../store/app-store";
import { getDatabase, getProjectRepository } from "./db";
import { audioExtensionForMime } from "./files";
import { useT } from "./i18n";
import { getServices } from "./services";

/** The board needs working room for uploads. Less than this free space counts as "not enough". */
const MIN_WORKING_BYTES = 200 * 1024 * 1024;

export interface NewCharacterInput {
  readonly name: string;
  readonly species: string;
  readonly ageGroup: string;
  readonly gender: string;
}

export interface NewEnvironmentInput {
  readonly name: string;
  readonly description: string;
}

export interface BoardActions {
  addCharacter(input: NewCharacterInput): Promise<void>;
  removeCharacter(characterId: string): Promise<void>;
  uploadView(characterId: string, view: CharacterView, file: File): Promise<void>;
  clearView(characterId: string, view: CharacterView): Promise<void>;
  lockViews(characterId: string): Promise<void>;
  unlockViews(characterId: string): Promise<void>;
  uploadVoice(characterId: string, file: File): Promise<void>;
  lockVoice(characterId: string): Promise<void>;
  unlockVoice(characterId: string): Promise<void>;
  addEnvironment(input: NewEnvironmentInput): Promise<void>;
  removeEnvironment(environmentId: string): Promise<void>;
  uploadPanorama(environmentId: string, file: File): Promise<void>;
  clearPanorama(environmentId: string): Promise<void>;
  protectStorage(): Promise<void>;
}

export interface BoardController {
  /** undefined while loading, null when the project does not exist. */
  readonly project: ProjectRecord | null | undefined;
  readonly registry: ValidationRegistry;
  readonly error: string | null;
  readonly notice: string | null;
  readonly busy: boolean;
  readonly actions: BoardActions;
}

/** Always reads the latest state, so rules never go stale. */
function readSnapshot(): BoardSnapshot {
  const state = useAppStore.getState();
  return {
    storyPassed: state.story_passed,
    durationMin: state.story_durationMin,
    characters: state.char_items,
    environments: state.env_items,
    mediaStatus: new Map(Object.entries(state.media_statuses)),
    configuredCapabilities: new Set(state.ai_configured),
    requiredCapabilities: new Set(state.ai_required),
    storageLevel: state.device_storageLevel,
  };
}

async function refreshStorage(): Promise<void> {
  const state = useAppStore.getState();
  const estimate = await readStorageEstimate();

  if (estimate === null) {
    state.device_setStorage("unknown", null, null);
  } else {
    const result = assessStorage({
      neededBytes: MIN_WORKING_BYTES,
      quotaBytes: estimate.quotaBytes,
      usageBytes: estimate.usageBytes,
    });
    state.device_setStorage(result.level, estimate.usageBytes, estimate.quotaBytes);
  }

  try {
    state.device_setPersisted(await navigator.storage.persisted());
  } catch {
    state.device_setPersisted(null);
  }
}

function panoramaRejection(issues: readonly PanoramaIssue[]): AppError {
  const first = issues.find((issue) => issue.severity === "error");
  return new AppError({
    code: "board.panorama_rejected",
    category: "media",
    messageKey: `ui.env.issue.${first?.code ?? "bad_aspect"}`,
    message: `Panorama rejected: ${issues.map((issue) => issue.code).join(", ")}`,
    recoverable: true,
  });
}

async function removeMedia(ids: ReadonlyArray<string | null>): Promise<void> {
  const { media } = getServices();
  for (const id of ids) {
    if (id !== null) {
      await media.remove(id);
    }
  }
}

/**
 * Loads a project's board, keeps the red-alert rules in step with it, and
 * exposes the actions of the screen. Every action refreshes the board and
 * turns any failure into a translated message.
 */
export function useBoardController(projectId: string | null): BoardController {
  const t = useT();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [project, setProject] = useState<ProjectRecord | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registry = useMemo(() => new ValidationRegistry(), []);
  const validation = useMemo(() => new BoardValidation(registry, readSnapshot), [registry]);
  useEffect(() => () => validation.dispose(), [validation]);

  const refresh = useCallback(async (): Promise<void> => {
    if (projectId === null) {
      return;
    }

    const record = await getProjectRepository().get(projectId);
    setProject(record ?? null);
    if (record === undefined) {
      return;
    }

    const { board, media } = getServices();
    await media.verifyProject(projectId);
    const loaded = await board.loadBoard(projectId);

    const state = useAppStore.getState();
    state.char_setItems(loaded.characters);
    state.env_setItems(loaded.environments);
    state.media_setStatuses(Object.fromEntries(loaded.mediaStatus));

    const story = await getDatabase().stories.get(projectId);
    const gate = story?.gatekeeperResult as { passed?: boolean } | null | undefined;
    state.story_setStatus(gate?.passed === true, record.durationMinTarget);

    validation.sync();
    await refreshStorage();
  }, [projectId, validation]);

  useEffect(() => {
    const state = useAppStore.getState();
    state.char_setItems([]);
    state.env_setItems([]);
    state.media_setStatuses({});
    state.story_setStatus(false, null);
    setError(null);
    setNotice(null);

    if (projectId === null) {
      setProject(null);
      return;
    }

    setProject(undefined);
    let cancelled = false;
    refresh().catch((cause: unknown) => {
      if (!cancelled) {
        setError(errorMessage(tRef.current, cause));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, refresh]);

  const run = useCallback(
    async (task: () => Promise<void>): Promise<void> => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        try {
          await task();
        } catch (cause) {
          setError(errorMessage(tRef.current, cause));
        }
        await refresh();
      } catch (cause) {
        setError(errorMessage(tRef.current, cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const actions = useMemo<BoardActions>(() => {
    const requireProject = (): string => {
      if (projectId === null) {
        throw new AppError({
          code: "board.no_project",
          category: "validation",
          messageKey: "ui.project.missingId",
          message: "No project is selected",
          recoverable: false,
        });
      }
      return projectId;
    };

    const findCharacter = (id: string) => useAppStore.getState().char_items.find((item) => item.id === id);
    const findEnvironment = (id: string) => useAppStore.getState().env_items.find((item) => item.id === id);

    return {
      addCharacter: (input) =>
        run(async () => {
          const id = requireProject();
          await getServices().board.syncCharacters(id, [
            {
              name: input.name,
              role: "",
              species: input.species,
              ageGroup: input.ageGroup,
              gender: input.gender,
              appearance: "",
              voiceTraits: "",
            },
          ]);
        }),

      removeCharacter: (characterId) =>
        run(async () => {
          const character = findCharacter(characterId);
          const mediaIds = character === undefined ? [] : [...Object.values(character.viewSlots), character.voiceSlot.sampleRef];
          await getServices().board.removeCharacter(characterId);
          await removeMedia(mediaIds);
        }),

      uploadView: (characterId, view, file) =>
        run(async () => {
          const id = requireProject();
          const { media, board } = getServices();
          const previous = findCharacter(characterId)?.viewSlots[view] ?? null;

          const record = await media.ingest(file, {
            projectId: id,
            kind: "image",
            origin: "upload",
            mime: file.type,
            extension: extensionForMime(file.type),
          });
          try {
            await board.setCharacterView(characterId, view, record.id);
          } catch (cause) {
            await media.remove(record.id);
            throw cause;
          }
          await removeMedia([previous]);
        }),

      clearView: (characterId, view) =>
        run(async () => {
          const previous = findCharacter(characterId)?.viewSlots[view] ?? null;
          await getServices().board.clearCharacterView(characterId, view);
          await removeMedia([previous]);
        }),

      lockViews: (characterId) =>
        run(async () => {
          await getServices().board.lockViews(characterId);
        }),

      unlockViews: (characterId) =>
        run(async () => {
          await getServices().board.unlockViews(characterId);
        }),

      uploadVoice: (characterId, file) =>
        run(async () => {
          const id = requireProject();
          const { media, board } = getServices();
          const previous = findCharacter(characterId)?.voiceSlot.sampleRef ?? null;

          const record = await media.ingest(file, {
            projectId: id,
            kind: "audio",
            origin: "upload",
            mime: file.type,
            extension: audioExtensionForMime(file.type),
          });
          try {
            await board.setVoiceUpload(characterId, record.id);
          } catch (cause) {
            await media.remove(record.id);
            throw cause;
          }
          await removeMedia([previous]);
        }),

      lockVoice: (characterId) =>
        run(async () => {
          await getServices().board.lockVoice(characterId);
        }),

      unlockVoice: (characterId) =>
        run(async () => {
          await getServices().board.unlockVoice(characterId);
        }),

      addEnvironment: (input) =>
        run(async () => {
          const id = requireProject();
          await getServices().board.syncEnvironments(id, [{ name: input.name, description: input.description }]);
        }),

      removeEnvironment: (environmentId) =>
        run(async () => {
          const previous = findEnvironment(environmentId)?.panoramaRef ?? null;
          await getServices().board.removeEnvironment(environmentId);
          await removeMedia([previous]);
        }),

      uploadPanorama: (environmentId, file) =>
        run(async () => {
          const id = requireProject();
          const { media, board, codec } = getServices();
          const previous = findEnvironment(environmentId)?.panoramaRef ?? null;

          const prepared = await preparePanorama(file, codec);
          if (!prepared.report.ok) {
            throw panoramaRejection(prepared.report.issues);
          }

          const mime = prepared.blob.type !== "" ? prepared.blob.type : file.type;
          const record = await media.ingest(prepared.blob, {
            projectId: id,
            kind: "panorama",
            origin: "upload",
            mime,
            extension: extensionForMime(mime),
            width: prepared.fixedSeam ? prepared.report.width : null,
            height: prepared.fixedSeam ? prepared.report.height : null,
          });
          try {
            await board.setPanorama(environmentId, record.id, {
              mode: "upload",
              seamScore: prepared.report.seamScore,
            });
          } catch (cause) {
            await media.remove(record.id);
            throw cause;
          }
          await removeMedia([previous]);

          const messages: string[] = [];
          if (prepared.fixedSeam) {
            messages.push(tRef.current("ui.env.seamFixed"));
          }
          for (const issue of prepared.report.issues) {
            if (issue.severity === "warning") {
              messages.push(tRef.current(`ui.env.issue.${issue.code}`));
            }
          }
          if (messages.length > 0) {
            setNotice(messages.join(" "));
          }
        }),

      clearPanorama: (environmentId) =>
        run(async () => {
          const previous = findEnvironment(environmentId)?.panoramaRef ?? null;
          await getServices().board.clearPanorama(environmentId);
          await removeMedia([previous]);
        }),

      protectStorage: () =>
        run(async () => {
          const result = await requestPersistence();
          useAppStore.getState().device_setPersisted(result === "granted");
        }),
    };
  }, [projectId, run]);

  return { project, registry, error, notice, busy, actions };
}

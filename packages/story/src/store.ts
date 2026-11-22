import { AppError } from "@avs/core";
import type { StoryMode, StudioDatabase } from "@avs/storage";
import { z } from "zod";
import type { GatekeeperResult } from "./gatekeeper";
import type { Outline, StoryProgress } from "./types";

export interface StoredStory {
  readonly mode: StoryMode;
  readonly rawInput: string;
  readonly gatekeeper: GatekeeperResult | null;
  readonly outline: Outline | null;
  readonly progress: StoryProgress | null;
}

/**
 * Generation state kept in StoryRecord.storyBible. The chunk texts themselves
 * are stored once, in StoryRecord.chunks.
 */
const persistedProgressSchema = z.object({
  nextSceneIndex: z.number().int().min(0),
  rollingSummary: z.string(),
  budgetDurationMin: z.number(),
  bible: z.object({
    tone: z.string(),
    facts: z.array(z.string()),
    characters: z.array(z.object({ name: z.string(), description: z.string() })),
  }),
  flags: z.array(z.object({ chunkIndex: z.number().int().min(0), description: z.string() })),
  chunkMeta: z.array(
    z.object({
      index: z.number().int().min(0),
      sceneStart: z.number().int().min(0),
      sceneEnd: z.number().int().min(0),
      words: z.number().int().min(0),
    }),
  ),
});

function corrupt(message: string, cause?: unknown): AppError {
  return new AppError({
    code: "storage.story_corrupt",
    category: "storage",
    messageKey: "error.storage.storyCorrupt",
    message,
    recoverable: false,
    cause,
  });
}

export interface StoryStoreOptions {
  readonly now?: () => number;
}

export class StoryStore {
  private readonly now: () => number;

  constructor(
    private readonly db: StudioDatabase,
    options: StoryStoreOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async save(projectId: string, story: StoredStory): Promise<void> {
    const existing = await this.db.stories.get(projectId);
    const createdAtByIndex = new Map(
      (existing?.chunks ?? []).map((chunk) => [chunk.index, chunk.createdAt] as const),
    );
    const timestamp = this.now();
    const progress = story.progress;

    await this.db.stories.put({
      projectId,
      mode: story.mode,
      rawInput: story.rawInput,
      gatekeeperResult: story.gatekeeper,
      outline: story.outline,
      storyBible:
        progress === null
          ? null
          : {
              nextSceneIndex: progress.nextSceneIndex,
              rollingSummary: progress.rollingSummary,
              budgetDurationMin: progress.budgetDurationMin,
              bible: progress.bible,
              flags: progress.flags,
              chunkMeta: progress.chunks.map((chunk) => ({
                index: chunk.index,
                sceneStart: chunk.sceneStart,
                sceneEnd: chunk.sceneEnd,
                words: chunk.words,
              })),
            },
      chunks: (progress?.chunks ?? []).map((chunk) => ({
        index: chunk.index,
        text: chunk.text,
        createdAt: createdAtByIndex.get(chunk.index) ?? timestamp,
      })),
    });
  }

  async load(projectId: string): Promise<StoredStory | undefined> {
    const record = await this.db.stories.get(projectId);
    if (record === undefined) {
      return undefined;
    }

    let progress: StoryProgress | null = null;
    if (record.storyBible !== null && record.storyBible !== undefined) {
      const parsed = persistedProgressSchema.safeParse(record.storyBible);
      if (!parsed.success) {
        throw corrupt("Saved story progress has an unexpected format", parsed.error);
      }

      const textByIndex = new Map(record.chunks.map((chunk) => [chunk.index, chunk.text] as const));
      const chunks = parsed.data.chunkMeta.map((meta) => {
        const text = textByIndex.get(meta.index);
        if (text === undefined) {
          throw corrupt(`Saved story is missing the text of chunk ${meta.index}`);
        }
        return { ...meta, text };
      });

      progress = {
        chunks,
        nextSceneIndex: parsed.data.nextSceneIndex,
        rollingSummary: parsed.data.rollingSummary,
        bible: parsed.data.bible,
        flags: parsed.data.flags,
        budgetDurationMin: parsed.data.budgetDurationMin,
      };
    }

    // Gatekeeper result and outline were validated when they were created.
    return {
      mode: record.mode,
      rawInput: record.rawInput,
      gatekeeper: (record.gatekeeperResult ?? null) as GatekeeperResult | null,
      outline: (record.outline ?? null) as Outline | null,
      progress,
    };
  }

  /** Returns an onProgress callback for the engine that saves every finished chunk. */
  progressSaver(
    projectId: string,
    base: Omit<StoredStory, "progress">,
  ): (progress: StoryProgress) => Promise<void> {
    return (progress) => this.save(projectId, { ...base, progress });
  }
}

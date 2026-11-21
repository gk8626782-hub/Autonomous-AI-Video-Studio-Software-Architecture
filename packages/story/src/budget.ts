import { AppError } from "@avs/core";
import type { Genre, StoryBudget, StoryLanguage } from "./types";

export const MIN_DURATION_MIN = 1;
export const MAX_DURATION_MIN = 240;

/** Starting assumptions for spoken words per minute. Tune with real test videos. */
export const DEFAULT_WORDS_PER_MINUTE: Readonly<Record<StoryLanguage, number>> = {
  en: 140,
  hi: 120,
  hinglish: 130,
};

/** Average scene length in seconds per genre. */
export const DEFAULT_SCENE_SECONDS: Readonly<Record<Genre, number>> = {
  cartoon: 30,
  anime: 40,
  bollywood: 60,
  cinematic: 50,
  educational: 60,
  devotional: 60,
  other: 45,
};

export interface BudgetInput {
  readonly durationMin: number;
  readonly language: StoryLanguage;
  readonly genre?: Genre;
  readonly wordsPerMinute?: Partial<Record<StoryLanguage, number>>;
  /** Share of the runtime that is spoken (narration and dialogue). Default 0.75. */
  readonly speechRatio?: number;
  readonly avgSceneSec?: number;
  /** Allowed deviation from the target, as a fraction. Default 0.1. */
  readonly tolerance?: number;
}

function invalid(field: string, message: string): AppError {
  return new AppError({
    code: `validation.invalid_${field}`,
    category: "validation",
    messageKey: `error.validation.${field}`,
    message,
    recoverable: true,
    details: { field },
  });
}

/**
 * Converts the duration chosen by the user into a word and scene budget.
 * The result is frozen: once generation starts it is the locked plan.
 */
export function planBudget(input: BudgetInput): Readonly<StoryBudget> {
  const { durationMin } = input;
  if (!Number.isFinite(durationMin) || durationMin < MIN_DURATION_MIN || durationMin > MAX_DURATION_MIN) {
    throw invalid(
      "duration",
      `Duration must be between ${MIN_DURATION_MIN} and ${MAX_DURATION_MIN} minutes`,
    );
  }

  const wordsPerMinute = input.wordsPerMinute?.[input.language] ?? DEFAULT_WORDS_PER_MINUTE[input.language];
  const speechRatio = input.speechRatio ?? 0.75;
  const tolerance = input.tolerance ?? 0.1;
  const avgSceneSec = input.avgSceneSec ?? DEFAULT_SCENE_SECONDS[input.genre ?? "other"];

  if (!(wordsPerMinute > 0)) throw invalid("words_per_minute", "Words per minute must be positive");
  if (!(speechRatio > 0 && speechRatio <= 1)) throw invalid("speech_ratio", "Speech ratio must be in (0, 1]");
  if (!(tolerance >= 0 && tolerance < 0.5)) throw invalid("tolerance", "Tolerance must be in [0, 0.5)");
  if (!(avgSceneSec > 0)) throw invalid("scene_seconds", "Scene length must be positive");

  const targetWords = Math.max(1, Math.round(durationMin * wordsPerMinute * speechRatio));
  const sceneCount = Math.max(1, Math.round((durationMin * 60) / avgSceneSec));

  return Object.freeze({
    durationMin,
    language: input.language,
    targetWords,
    minWords: Math.floor(targetWords * (1 - tolerance)),
    maxWords: Math.ceil(targetWords * (1 + tolerance)),
    sceneCount,
    avgSceneSec,
    wordsPerScene: Math.round(targetWords / sceneCount),
  });
}

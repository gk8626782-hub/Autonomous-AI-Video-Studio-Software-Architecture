export const STORY_LANGUAGES = ["hi", "en", "hinglish"] as const;
export type StoryLanguage = (typeof STORY_LANGUAGES)[number];
export type DetectedLanguage = StoryLanguage | "unknown";

export const GENRES = [
  "cartoon",
  "bollywood",
  "anime",
  "cinematic",
  "educational",
  "devotional",
  "other",
] as const;
export type Genre = (typeof GENRES)[number];

export const TRADITIONS = ["hindu", "islam", "sikh", "christian", "buddhist", "jain"] as const;
export type Tradition = (typeof TRADITIONS)[number];

export interface TextGenerationInput {
  readonly system: string;
  readonly prompt: string;
  readonly maxTokens?: number;
  /** True when the reply must be a JSON document. */
  readonly json?: boolean;
}

export type FinishReason = "stop" | "length" | "other";

export interface TextGenerationOutput {
  readonly text: string;
  readonly finishReason: FinishReason;
}

/** The only thing the story engine needs from an AI provider. */
export type TextGenerator = (input: TextGenerationInput) => Promise<TextGenerationOutput>;

export interface StoryContext {
  readonly language: StoryLanguage;
  readonly genre: Genre;
  readonly tradition: Tradition | null;
}

/** Word budget derived from the duration the user locked in. */
export interface StoryBudget {
  readonly durationMin: number;
  readonly language: StoryLanguage;
  readonly targetWords: number;
  readonly minWords: number;
  readonly maxWords: number;
  readonly sceneCount: number;
  readonly avgSceneSec: number;
  readonly wordsPerScene: number;
}

export interface OutlineScene {
  readonly index: number;
  readonly title: string;
  readonly summary: string;
  readonly targetSec: number;
  readonly location: string;
  readonly characters: readonly string[];
}

export interface Outline {
  readonly title: string;
  readonly logline: string;
  readonly scenes: readonly OutlineScene[];
}

export interface BibleCharacter {
  readonly name: string;
  readonly description: string;
}

/** Facts the writer must stay consistent with across the whole story. */
export interface StoryBible {
  readonly tone: string;
  readonly facts: readonly string[];
  readonly characters: readonly BibleCharacter[];
}

export interface GeneratedChunk {
  readonly index: number;
  readonly sceneStart: number;
  readonly sceneEnd: number;
  readonly text: string;
  readonly words: number;
}

export interface ContinuityFlag {
  readonly chunkIndex: number;
  readonly description: string;
}

/** Everything needed to resume story generation after a crash or reload. */
export interface StoryProgress {
  readonly chunks: readonly GeneratedChunk[];
  readonly nextSceneIndex: number;
  readonly rollingSummary: string;
  readonly bible: StoryBible;
  readonly flags: readonly ContinuityFlag[];
  /** The duration the budget was planned for. Used to enforce the duration lock. */
  readonly budgetDurationMin: number;
}

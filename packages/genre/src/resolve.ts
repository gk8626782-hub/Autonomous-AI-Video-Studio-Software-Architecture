import { GENRES, TRADITIONS } from "@avs/story";
import type { Genre, StoryLanguage, Tradition } from "@avs/story";
import { BASE_PROFILES, TRADITION_OVERRIDES } from "./profiles";
import { profileSchema } from "./schema";
import type { GenreProfile, ProfileOverride } from "./schema";

export interface ProfileSelection {
  readonly genre: Genre;
  readonly tradition: Tradition | null;
}

/** Id stored on the project: "cartoon" or "devotional:hindu". */
export function profileIdFor(selection: ProfileSelection): string {
  return selection.tradition === null ? selection.genre : `${selection.genre}:${selection.tradition}`;
}

export function parseProfileId(id: string): ProfileSelection | null {
  const [genre, tradition, ...rest] = id.split(":");
  if (genre === undefined || rest.length > 0 || !(GENRES as readonly string[]).includes(genre)) {
    return null;
  }
  if (tradition === undefined) {
    return { genre: genre as Genre, tradition: null };
  }
  if (!(TRADITIONS as readonly string[]).includes(tradition)) {
    return null;
  }
  return { genre: genre as Genre, tradition: tradition as Tradition };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Objects are merged level by level. Arrays and other values from the override replace the base. */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      result[key] = deepMerge(base[key], value);
    }
  }
  return result;
}

/** Applies an override to a profile and checks that the result is still valid. */
export function mergeProfile(base: GenreProfile, override: ProfileOverride): GenreProfile {
  return profileSchema.parse(deepMerge(base, override));
}

/**
 * The profile for a genre and an optional tradition.
 * The tradition's sensitivity rules apply to every genre. Its look and sound
 * apply only to devotional stories.
 */
export function resolveProfile(selection: ProfileSelection): GenreProfile {
  const base = BASE_PROFILES[selection.genre];
  let merged = base;

  if (selection.tradition !== null) {
    const override = TRADITION_OVERRIDES[selection.tradition];
    merged = mergeProfile(base, selection.genre === "devotional" ? override : { sensitivity: override.sensitivity });
  }

  return mergeProfile(merged, { id: profileIdFor(selection), tradition: selection.tradition });
}

/** Every profile the app offers: each genre, and devotional with each tradition. */
export function listProfileIds(): string[] {
  const ids: string[] = GENRES.map((genre) => genre as string);
  for (const tradition of TRADITIONS) {
    ids.push(profileIdFor({ genre: "devotional", tradition }));
  }
  return ids;
}

export type SubtitleScript = "devanagari" | "latin" | "mixed";

export function subtitleScriptFor(language: StoryLanguage): SubtitleScript {
  if (language === "hi") {
    return "devanagari";
  }
  return language === "en" ? "latin" : "mixed";
}

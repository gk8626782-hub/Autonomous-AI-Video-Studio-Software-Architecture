import { countWords } from "@avs/story";
import { splitSentences } from "./beats";

export interface ChunkText {
  /** First scene covered by this chunk. */
  readonly sceneStart: number;
  /** One past the last scene covered. */
  readonly sceneEnd: number;
  readonly text: string;
}

const SEPARATOR = /^\s*(\*{3,}|-{3,})\s*$/;

/**
 * Splits the text of a chunk across the scenes it covers.
 * Explicit separator lines (*** or ---) are used when their number fits.
 * Otherwise paragraphs (or sentences, if there are too few paragraphs) are
 * shared out in proportion to each scene's planned length.
 */
export function splitForScenes(text: string, weights: readonly number[]): string[] {
  if (weights.length <= 1) {
    return [text.trim()];
  }

  const lines = text.split(/\r?\n/);
  const separators = lines.filter((line) => SEPARATOR.test(line)).length;
  if (separators === weights.length - 1) {
    const parts: string[][] = [[]];
    for (const line of lines) {
      if (SEPARATOR.test(line)) {
        parts.push([]);
      } else {
        parts[parts.length - 1]?.push(line);
      }
    }
    return parts.map((part) => part.join("\n").trim());
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const useSentences = paragraphs.length < weights.length;
  const units = useSentences ? splitSentences(text) : paragraphs;
  const joiner = useSentences ? " " : "\n\n";

  const unitWords = units.map((unit) => Math.max(1, countWords(unit)));
  const totalWords = unitWords.reduce((sum, count) => sum + count, 0);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const boundaries: number[] = [];
  let accumulated = 0;
  for (const weight of weights) {
    accumulated += weight;
    boundaries.push((totalWords * accumulated) / totalWeight);
  }

  const buckets: string[][] = weights.map(() => []);
  let cumulative = 0;
  units.forEach((unit, index) => {
    const words = unitWords[index] ?? 1;
    const middle = cumulative + words / 2;
    let target = boundaries.findIndex((boundary) => middle < boundary);
    if (target === -1) {
      target = weights.length - 1;
    }
    buckets[target]?.push(unit);
    cumulative += words;
  });

  return buckets.map((bucket) => bucket.join(joiner));
}

/** Text for every scene, in scene order. Scenes with no text get an empty string. */
export function assignTextToScenes(targetSecs: readonly number[], chunks: readonly ChunkText[]): string[] {
  const perScene: string[][] = targetSecs.map(() => []);

  for (const chunk of chunks) {
    const start = Math.max(0, chunk.sceneStart);
    const end = Math.min(targetSecs.length, chunk.sceneEnd);
    if (end <= start) {
      continue;
    }
    const parts = splitForScenes(chunk.text, targetSecs.slice(start, end));
    parts.forEach((part, offset) => {
      if (part !== "") {
        perScene[start + offset]?.push(part);
      }
    });
  }

  return perScene.map((parts) => parts.join("\n\n"));
}

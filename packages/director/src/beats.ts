import { DEFAULT_WORDS_PER_MINUTE, countWords, parseDialogue } from "@avs/story";
import type { StoryLanguage } from "@avs/story";

/** One spoken or narrated piece of a scene. */
export interface Beat {
  readonly kind: "dialogue" | "narration";
  readonly speakerName: string | null;
  readonly text: string;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Packs sentences into pieces of at most maxWords words. A sentence that is
 * too long is cut into equal parts at word boundaries.
 */
export function packSentences(sentences: readonly string[], maxWords: number): string[] {
  const packs: string[] = [];
  let current: string[] = [];
  let words = 0;

  const flush = (): void => {
    if (current.length > 0) {
      packs.push(current.join(" "));
      current = [];
      words = 0;
    }
  };

  for (const sentence of sentences) {
    const count = countWords(sentence);

    if (count > maxWords) {
      flush();
      const tokens = sentence.split(/\s+/);
      const parts = Math.ceil(tokens.length / maxWords);
      const size = Math.ceil(tokens.length / parts);
      for (let i = 0; i < tokens.length; i += size) {
        packs.push(tokens.slice(i, i + size).join(" "));
      }
      continue;
    }

    if (words + count > maxWords) {
      flush();
    }
    current.push(sentence);
    words += count;
  }

  flush();
  return packs;
}

/**
 * Reads a scene into beats. A line "Name: words" from a known character is
 * dialogue; everything else is narration. Separator lines (*** or ---) are ignored.
 */
export function parseBeats(text: string, characterNames: readonly string[], maxWordsPerBeat: number): Beat[] {
  const beats: Beat[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || /^(\*{3,}|-{3,})$/.test(line)) {
      continue;
    }

    const dialogue = parseDialogue(line, characterNames)[0];
    if (dialogue !== undefined) {
      for (const part of packSentences(splitSentences(dialogue.text), maxWordsPerBeat)) {
        beats.push({ kind: "dialogue", speakerName: dialogue.characterName, text: part });
      }
      continue;
    }

    for (const part of packSentences(splitSentences(line), maxWordsPerBeat)) {
      beats.push({ kind: "narration", speakerName: null, text: part });
    }
  }

  return beats;
}

const PAD_MS = 200;
const MIN_SPEECH_MS = 400;

/** Estimated time to speak a text, plus a short pause. The real length comes from the voice later. */
export function estimateSpeechMs(text: string, language: StoryLanguage): number {
  const wordsPerMinute = DEFAULT_WORDS_PER_MINUTE[language];
  return Math.max(MIN_SPEECH_MS, Math.round((countWords(text) / wordsPerMinute) * 60_000)) + PAD_MS;
}

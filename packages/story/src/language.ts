import type { DetectedLanguage } from "./types";

/**
 * Cheap, local script-based detection.
 * Romanized Hindi (Hindi written in Latin letters) looks like English here;
 * the AI classifier in the gatekeeper makes the final call.
 */
export function detectLanguage(text: string): DetectedLanguage {
  let devanagari = 0;
  let latin = 0;

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x0900 && code <= 0x097f) {
      devanagari += 1;
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      latin += 1;
    }
  }

  const total = devanagari + latin;
  if (total === 0) {
    return "unknown";
  }

  const ratio = devanagari / total;
  if (ratio >= 0.8) {
    return "hi";
  }
  if (ratio <= 0.05) {
    return "en";
  }
  return "hinglish";
}

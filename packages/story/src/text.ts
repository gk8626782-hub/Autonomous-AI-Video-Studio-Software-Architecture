const WORD_PATTERN = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;

/** Splits text into words. Works for Devanagari (combining marks stay inside the word). */
export function splitWords(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

export function countWords(text: string): number {
  return splitWords(text).length;
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function tailOf(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(text.length - maxChars);
}

export function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

/**
 * Removes the part of "next" that repeats the end of "previous".
 * Models often restart a few words earlier when asked to continue.
 */
export function trimOverlap(
  previous: string,
  next: string,
  minOverlap = 20,
  maxOverlap = 400,
): string {
  const limit = Math.min(maxOverlap, previous.length, next.length);
  for (let size = limit; size >= minOverlap; size -= 1) {
    if (previous.endsWith(next.slice(0, size))) {
      return next.slice(size);
    }
  }
  return next;
}

/** Appends a continuation to existing text, dropping repeated text and fixing spacing. */
export function joinContinuation(previous: string, next: string): string {
  const cleaned = trimOverlap(previous, next).replace(/^\s+/, "");
  if (cleaned.length === 0) {
    return previous;
  }
  const base = previous.replace(/\s+$/, "");
  const attachesDirectly = /^[,.;:!?)\]}।”’"']/.test(cleaned);
  const keepsNewline = /\n\s*$/.test(previous);
  const separator = keepsNewline ? "\n" : attachesDirectly ? "" : " ";
  return base + separator + cleaned;
}

/**
 * Parses the JSON document in a model reply. Accepts a fenced code block or
 * extra text around the JSON. Throws SyntaxError when nothing usable is found.
 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();

  const start = candidate.search(/[{[]/);
  if (start === -1) {
    throw new SyntaxError("No JSON found in the reply");
  }
  const close = candidate.charAt(start) === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) {
    throw new SyntaxError("Unterminated JSON in the reply");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

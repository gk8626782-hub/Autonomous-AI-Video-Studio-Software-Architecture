function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) {
    return [paragraph];
  }

  const sentences = paragraph.split(/(?<=[.!?।])\s+/u);
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current !== "") {
        parts.push(current);
        current = "";
      }
      for (let offset = 0; offset < sentence.length; offset += maxChars) {
        parts.push(sentence.slice(offset, offset + maxChars));
      }
      continue;
    }

    const candidate = current === "" ? sentence : `${current} ${sentence}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      parts.push(current);
      current = sentence;
    }
  }

  if (current !== "") {
    parts.push(current);
  }
  return parts;
}

/**
 * Splits a pasted story into segments of at most maxChars, preferring
 * paragraph breaks, then sentence ends, and only then hard cuts.
 */
export function segmentStory(text: string, maxChars = 6000): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const pieces: string[] = [];
  for (const paragraph of paragraphs) {
    pieces.push(...splitLongParagraph(paragraph, maxChars));
  }

  const segments: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const candidate = current === "" ? piece : `${current}\n\n${piece}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current !== "") {
        segments.push(current);
      }
      current = piece;
    }
  }
  if (current !== "") {
    segments.push(current);
  }
  return segments;
}

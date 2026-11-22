import { describe, expect, it } from "vitest";
import {
  countWords,
  extractJson,
  joinContinuation,
  normalizeName,
  tailOf,
  trimOverlap,
  truncate,
} from "./text";

describe("countWords", () => {
  it("counts English words, contractions and hyphenated words", () => {
    expect(countWords("Hello world")).toBe(2);
    expect(countWords("don't stop")).toBe(2);
    expect(countWords("state-of-the-art idea")).toBe(2);
    expect(countWords("3 apples")).toBe(2);
  });

  it("counts Hindi words with combining marks and ignores the danda", () => {
    expect(countWords("नमस्ते दुनिया")).toBe(2);
    expect(countWords("वह घर गया ।")).toBe(3);
  });

  it("returns 0 for empty or symbol-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("... !!! ???")).toBe(0);
  });
});

describe("helpers", () => {
  it("normalizes names", () => {
    expect(normalizeName("  Asha   Devi ")).toBe("asha devi");
  });

  it("takes the tail and truncates", () => {
    expect(tailOf("abcdef", 3)).toBe("def");
    expect(tailOf("abc", 10)).toBe("abc");
    expect(truncate("abcdefghij", 6)).toBe("abc...");
    expect(truncate("abc", 6)).toBe("abc");
  });
});

describe("trimOverlap and joinContinuation", () => {
  const previous = "The quick brown fox jumps over the lazy dog";

  it("removes repeated text at the start of a continuation", () => {
    expect(trimOverlap(previous, "jumps over the lazy dog and runs away")).toBe(" and runs away");
    expect(joinContinuation(previous, "jumps over the lazy dog and runs away")).toBe(
      "The quick brown fox jumps over the lazy dog and runs away",
    );
  });

  it("ignores very short overlaps", () => {
    expect(trimOverlap("abc def", "def ghi")).toBe("def ghi");
  });

  it("joins with a single space", () => {
    expect(joinContinuation("Hello there", "world")).toBe("Hello there world");
    expect(joinContinuation("It ended.", "Next day")).toBe("It ended. Next day");
  });

  it("keeps a line break and attaches punctuation directly", () => {
    expect(joinContinuation("Asha: Hello\n", "Ravi: Hi")).toBe("Asha: Hello\nRavi: Hi");
    expect(joinContinuation("and then", ", suddenly")).toBe("and then, suddenly");
  });

  it("returns the original text when the continuation is only overlap", () => {
    expect(joinContinuation(previous, "jumps over the lazy dog")).toBe(previous);
  });
});

describe("extractJson", () => {
  it("parses plain JSON and JSON with surrounding text", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here it is: {"a": [1, 2]} Hope that helps.')).toEqual({ a: [1, 2] });
  });

  it("parses fenced code blocks and arrays", () => {
    expect(extractJson('```json\n{"ok": true}\n```')).toEqual({ ok: true });
    expect(extractJson("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("throws when there is no usable JSON", () => {
    expect(() => extractJson("no json here")).toThrowError(SyntaxError);
    expect(() => extractJson('{"a": ')).toThrowError(SyntaxError);
    expect(() => extractJson("{ not valid }")).toThrowError(SyntaxError);
  });
});

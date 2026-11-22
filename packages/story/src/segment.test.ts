import { describe, expect, it } from "vitest";
import { segmentStory } from "./segment";

describe("segmentStory", () => {
  it("returns nothing for empty text", () => {
    expect(segmentStory("")).toEqual([]);
    expect(segmentStory("  \n\n  ")).toEqual([]);
  });

  it("keeps short paragraphs together in one segment", () => {
    expect(segmentStory("First paragraph.\n\nSecond paragraph.", 100)).toEqual([
      "First paragraph.\n\nSecond paragraph.",
    ]);
  });

  it("starts a new segment at a paragraph break when the limit is reached", () => {
    const a = "a".repeat(25);
    const b = "b".repeat(25);
    expect(segmentStory(`${a}\n\n${b}`, 40)).toEqual([a, b]);
  });

  it("splits a long paragraph at sentence ends", () => {
    expect(segmentStory("One two three. Four five six. Seven eight nine.", 30)).toEqual([
      "One two three. Four five six.",
      "Seven eight nine.",
    ]);
  });

  it("splits Hindi text at the danda", () => {
    const text = "पहला वाक्य यहाँ है। दूसरा वाक्य यहाँ है।";
    expect(segmentStory(text, 25)).toEqual(["पहला वाक्य यहाँ है।", "दूसरा वाक्य यहाँ है।"]);
  });

  it("cuts text without any sentence ends at the limit", () => {
    expect(segmentStory("x".repeat(50), 20)).toEqual(["x".repeat(20), "x".repeat(20), "x".repeat(10)]);
  });

  it("never returns a segment longer than the limit", () => {
    const text = Array.from({ length: 40 }, (_unused, i) => `Sentence number ${i} is here.`).join(" ");
    for (const segment of segmentStory(text, 120)) {
      expect(segment.length).toBeLessThanOrEqual(120);
    }
  });
});

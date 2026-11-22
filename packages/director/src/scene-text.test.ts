import { describe, expect, it } from "vitest";
import { assignTextToScenes, splitForScenes } from "./scene-text";

describe("splitForScenes", () => {
  it("returns the whole text for a single scene", () => {
    expect(splitForScenes("  All of it.  ", [30])).toEqual(["All of it."]);
  });

  it("uses explicit separators when their number fits", () => {
    expect(splitForScenes("First.\n***\nSecond.\n***\nThird.", [10, 10, 10])).toEqual(["First.", "Second.", "Third."]);
  });

  it("shares paragraphs in proportion to the scene lengths", () => {
    const text = ["one one one one", "two two two two", "three three three three", "four four four four"].join("\n\n");

    expect(splitForScenes(text, [30, 30])).toEqual([
      "one one one one\n\ntwo two two two",
      "three three three three\n\nfour four four four",
    ]);
    expect(splitForScenes(text, [10, 30])).toEqual([
      "one one one one",
      "two two two two\n\nthree three three three\n\nfour four four four",
    ]);
  });

  it("falls back to sentences when there are fewer paragraphs than scenes", () => {
    expect(splitForScenes("One a. Two b. Three c. Four d.", [1, 1])).toEqual(["One a. Two b.", "Three c. Four d."]);
  });

  it("does not lose any text", () => {
    const text = Array.from({ length: 9 }, (_unused, i) => `Paragraph number ${i} has some words.`).join("\n\n");
    const parts = splitForScenes(text, [20, 40, 30]);

    expect(parts).toHaveLength(3);
    expect(parts.join("\n\n")).toBe(text);
  });
});

describe("assignTextToScenes", () => {
  it("places each chunk's text on the scenes it covers", () => {
    const result = assignTextToScenes([30, 30, 30], [
      { sceneStart: 0, sceneEnd: 2, text: "A one.\n\nA two." },
      { sceneStart: 2, sceneEnd: 3, text: "B one." },
    ]);

    expect(result).toEqual(["A one.", "A two.", "B one."]);
  });

  it("appends an extension chunk to the last scene", () => {
    const result = assignTextToScenes([30, 30], [
      { sceneStart: 0, sceneEnd: 2, text: "A one.\n\nA two." },
      { sceneStart: 1, sceneEnd: 2, text: "Extra text." },
    ]);

    expect(result[1]).toBe("A two.\n\nExtra text.");
  });

  it("gives an empty string to scenes without text and ignores chunks outside the scenes", () => {
    const result = assignTextToScenes([30, 30, 30], [
      { sceneStart: 0, sceneEnd: 1, text: "Only first." },
      { sceneStart: 5, sceneEnd: 6, text: "Out of range." },
    ]);

    expect(result).toEqual(["Only first.", "", ""]);
  });
});

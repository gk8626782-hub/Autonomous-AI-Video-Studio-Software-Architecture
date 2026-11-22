import { describe, expect, it } from "vitest";
import { estimateSpeechMs, packSentences, parseBeats, splitSentences } from "./beats";

describe("splitSentences", () => {
  it("splits at sentence ends in English and Hindi", () => {
    expect(splitSentences("One two. Three four! Five six?")).toEqual(["One two.", "Three four!", "Five six?"]);
    expect(splitSentences("पहला वाक्य है। दूसरा वाक्य है।")).toEqual(["पहला वाक्य है।", "दूसरा वाक्य है।"]);
  });
});

describe("packSentences", () => {
  it("packs sentences up to the word limit", () => {
    expect(packSentences(["a b c.", "d e.", "f g h i."], 5)).toEqual(["a b c. d e.", "f g h i."]);
  });

  it("cuts an overlong sentence into equal parts", () => {
    expect(packSentences(["one two three four five six seven eight"], 5)).toEqual([
      "one two three four",
      "five six seven eight",
    ]);
  });
});

describe("parseBeats", () => {
  const names = ["Asha", "Ravi"];

  it("separates dialogue from narration and ignores separators", () => {
    const text = ["The sun rose.", "Asha: Where is my lamp?", "***", "Note: this is not a character", "Ravi: Here."].join(
      "\n",
    );

    expect(parseBeats(text, names, 20)).toEqual([
      { kind: "narration", speakerName: null, text: "The sun rose." },
      { kind: "dialogue", speakerName: "Asha", text: "Where is my lamp?" },
      { kind: "narration", speakerName: null, text: "Note: this is not a character" },
      { kind: "dialogue", speakerName: "Ravi", text: "Here." },
    ]);
  });

  it("splits a long dialogue line into several beats for the same speaker", () => {
    const beats = parseBeats("Asha: Hello there. How are you today my friend?", names, 4);

    expect(beats.map((beat) => beat.text)).toEqual(["Hello there.", "How are you", "today my friend?"]);
    expect(beats.every((beat) => beat.kind === "dialogue" && beat.speakerName === "Asha")).toBe(true);
  });

  it("returns nothing for empty text", () => {
    expect(parseBeats("  \n\n ", names, 10)).toEqual([]);
  });
});

describe("estimateSpeechMs", () => {
  it("grows with the number of words and uses the language speed", () => {
    const english = estimateSpeechMs("one two three four five six seven", "en");
    const hindi = estimateSpeechMs("one two three four five six seven", "hi");

    expect(english).toBeGreaterThan(estimateSpeechMs("one two", "en"));
    expect(hindi).toBeGreaterThan(english);
  });

  it("never returns less than a short pause", () => {
    expect(estimateSpeechMs("", "en")).toBe(600);
  });
});

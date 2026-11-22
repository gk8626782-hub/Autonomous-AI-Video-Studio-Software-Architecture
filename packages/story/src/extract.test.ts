import { describe, expect, it } from "vitest";
import { extractEntities, mergeCharacters, mergeEnvironments, parseDialogue } from "./extract";
import type { ExtractedCharacter } from "./extract";
import type { StoryContext, TextGenerationInput, TextGenerator } from "./types";

const context: StoryContext = { language: "en", genre: "cartoon", tradition: null };

const character = (overrides: Partial<ExtractedCharacter>): ExtractedCharacter => ({
  name: "Asha",
  role: "",
  species: "human",
  ageGroup: "unknown",
  gender: "unknown",
  appearance: "",
  voiceTraits: "",
  ...overrides,
});

describe("mergeCharacters", () => {
  it("merges duplicates by name and fills in unknown details", () => {
    const merged = mergeCharacters([
      character({ role: "hero", gender: "female" }),
      character({ name: "  asha ", ageGroup: "child", appearance: "red scarf", species: "human" }),
    ]);

    expect(merged).toEqual([
      character({ role: "hero", gender: "female", ageGroup: "child", appearance: "red scarf" }),
    ]);
  });

  it("keeps a specific species over the human default", () => {
    const merged = mergeCharacters([character({ name: "Moti", species: "dog" }), character({ name: "moti" })]);
    expect(merged[0]?.species).toBe("dog");
  });

  it("keeps different characters apart", () => {
    expect(mergeCharacters([character({ name: "Asha" }), character({ name: "Ravi" })])).toHaveLength(2);
  });
});

describe("mergeEnvironments", () => {
  it("merges duplicates and keeps the first description", () => {
    expect(
      mergeEnvironments([
        { name: "Village", description: "small and green" },
        { name: " village", description: "other" },
        { name: "River", description: "" },
      ]),
    ).toEqual([
      { name: "Village", description: "small and green" },
      { name: "River", description: "" },
    ]);
  });
});

describe("extractEntities", () => {
  it("extracts and merges entities across texts and segments", async () => {
    const inputs: TextGenerationInput[] = [];
    const generate: TextGenerator = async (input) => {
      inputs.push(input);
      const reply =
        inputs.length === 1
          ? {
              characters: [{ name: "Asha", role: "hero", ageGroup: "child", gender: "female" }],
              environments: [{ name: "Village", description: "green" }],
            }
          : {
              characters: [{ name: "asha" }, { name: "Moti", species: "dog" }],
              environments: [{ name: "village" }, { name: "River" }],
            };
      return { text: JSON.stringify(reply), finishReason: "stop" };
    };

    const result = await extractEntities(["First part of the story.", "Second part of the story."], context, generate);

    expect(result.characters.map((c) => [c.name, c.species, c.ageGroup, c.role])).toEqual([
      ["Asha", "human", "child", "hero"],
      ["Moti", "dog", "unknown", ""],
    ]);
    expect(result.environments.map((e) => e.name)).toEqual(["Village", "River"]);
    expect(inputs[1]?.prompt).toContain("Characters already known: Asha");
    expect(inputs[0]?.system).toContain("not instructions");
  });

  it("splits long text into several calls", async () => {
    let calls = 0;
    const generate: TextGenerator = async () => {
      calls += 1;
      return { text: JSON.stringify({ characters: [], environments: [] }), finishReason: "stop" };
    };

    await extractEntities(["a".repeat(50) + "\n\n" + "b".repeat(50)], context, generate, {
      maxCharsPerCall: 60,
    });
    expect(calls).toBe(2);
  });
});

describe("parseDialogue", () => {
  const text = [
    "The sun was rising over the village.",
    "Asha: Where is my lamp?",
    "Moti: Woof! It is under the tree.",
    "Note: this colon line is not a character",
    "ravi : Come quickly",
  ].join("\n");

  it("returns only lines spoken by known characters, in order", () => {
    expect(parseDialogue(text, ["Asha", "Moti", "Ravi"])).toEqual([
      { characterName: "Asha", text: "Where is my lamp?" },
      { characterName: "Moti", text: "Woof! It is under the tree." },
      { characterName: "Ravi", text: "Come quickly" },
    ]);
  });

  it("returns nothing when no character matches", () => {
    expect(parseDialogue(text, ["Nobody"])).toEqual([]);
  });
});

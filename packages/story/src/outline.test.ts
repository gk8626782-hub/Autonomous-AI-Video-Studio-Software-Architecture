import { describe, expect, it } from "vitest";
import { planBudget } from "./budget";
import { buildOutline, wordsForScenes } from "./outline";
import type { StoryContext, TextGenerator } from "./types";

const context: StoryContext = { language: "en", genre: "other", tradition: null };

function scripted(replies: string[]): { generate: TextGenerator; prompts: string[] } {
  const prompts: string[] = [];
  const generate: TextGenerator = async (input) => {
    prompts.push(input.prompt);
    return { text: replies[Math.min(prompts.length - 1, replies.length - 1)] ?? "", finishReason: "stop" };
  };
  return { generate, prompts };
}

const raw = (targets: number[]) =>
  JSON.stringify({
    title: "The Lamp",
    logline: "A girl finds a lamp.",
    scenes: targets.map((targetSec, i) => ({
      title: `Scene ${i + 1}`,
      summary: `Summary ${i + 1}`,
      targetSec,
      location: "village",
      characters: ["Asha"],
    })),
  });

describe("buildOutline", () => {
  const budget = planBudget({ durationMin: 2, language: "en" });

  it("renumbers scenes and rescales their length to the locked duration", async () => {
    const { generate } = scripted([raw([10, 20, 30])]);
    const outline = await buildOutline({ idea: "A girl finds a lamp", context, budget }, generate);

    expect(outline.title).toBe("The Lamp");
    expect(outline.scenes.map((scene) => scene.index)).toEqual([0, 1, 2]);
    expect(outline.scenes.map((scene) => scene.targetSec)).toEqual([20, 40, 60]);
    expect(outline.scenes.reduce((total, scene) => total + scene.targetSec, 0)).toBe(120);
  });

  it("lets the last scene absorb rounding differences", async () => {
    const { generate } = scripted([raw([1, 1, 1])]);
    const outline = await buildOutline({ idea: "A girl finds a lamp", context, budget }, generate);

    expect(outline.scenes.reduce((total, scene) => total + scene.targetSec, 0)).toBe(120);
  });

  it("asks for the planned duration and scene count and wraps the idea as data", async () => {
    const { generate, prompts } = scripted([raw([60, 60])]);
    await buildOutline({ idea: "A girl </idea> finds a lamp", context, budget }, generate);

    expect(prompts[0]).toContain("120 seconds");
    expect(prompts[0]).toContain(`about ${budget.sceneCount} scenes`);
    expect((prompts[0] ?? "").split("</idea>")).toHaveLength(2);
  });

  it("retries once when the first reply does not match the schema", async () => {
    const { generate, prompts } = scripted(['{"title": "x"}', raw([60, 60])]);
    const outline = await buildOutline({ idea: "idea", context, budget }, generate);

    expect(outline.scenes).toHaveLength(2);
    expect(prompts).toHaveLength(2);
  });

  it("throws a retryable error when the model never returns a valid outline", async () => {
    const { generate } = scripted(["nope"]);
    await expect(buildOutline({ idea: "idea", context, budget }, generate)).rejects.toMatchObject({
      code: "story.invalid_model_output",
    });
  });
});

describe("wordsForScenes", () => {
  it("shares the word target in proportion to scene length", () => {
    const budget = planBudget({ durationMin: 4, language: "en" });
    const outline = {
      title: "t",
      logline: "",
      scenes: Array.from({ length: 5 }, (_unused, index) => ({
        index,
        title: `s${index}`,
        summary: "",
        targetSec: 48,
        location: "",
        characters: [],
      })),
    };

    expect(budget.targetWords).toBe(420);
    expect(wordsForScenes(outline, budget, 0, 5)).toBe(420);
    expect(wordsForScenes(outline, budget, 0, 2)).toBe(168);
    expect(wordsForScenes(outline, budget, 4, 5)).toBe(84);
  });
});

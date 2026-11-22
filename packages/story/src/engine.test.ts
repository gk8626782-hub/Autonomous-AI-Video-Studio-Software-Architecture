import { describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { planBudget } from "./budget";
import { generateStory } from "./engine";
import type { StoryProgress, StoryContext, Outline, TextGenerator } from "./types";

const context: StoryContext = { language: "en", genre: "other", tradition: null };
// 4 minutes of English: 420 target words (min 378, max 462) in 5 scenes of 48 seconds.
const budget = planBudget({ durationMin: 4, language: "en" });

const outline: Outline = {
  title: "The Lamp",
  logline: "A girl finds a lamp.",
  scenes: Array.from({ length: 5 }, (_unused, index) => ({
    index,
    title: `Scene ${index + 1}`,
    summary: `Summary ${index + 1}`,
    targetSec: 48,
    location: "village",
    characters: ["Asha"],
  })),
};

interface Call {
  readonly kind: "chunk" | "continuation" | "topup" | "bible";
  readonly target: number;
}

interface FakeOptions {
  readonly chunkFactor?: number;
  readonly topUpFactor?: number;
  readonly lengthFirstChunk?: boolean;
  readonly alwaysLength?: boolean;
  readonly contradictions?: readonly string[];
  /** Throws a retryable error on this chunk call (1-based). */
  readonly failOnChunkCall?: number;
}

function numberAfter(pattern: RegExp, text: string): number {
  return Number(pattern.exec(text)?.[1] ?? "0");
}

/** Fake model. Every word is unique so continuation overlap is never detected by accident. */
function makeFake(options: FakeOptions = {}): { generate: TextGenerator; calls: Call[] } {
  const calls: Call[] = [];
  let counter = 0;
  let chunkCalls = 0;
  let lengthUsed = false;
  const words = (count: number): string =>
    Array.from({ length: count }, () => `w${++counter}`).join(" ");

  const generate: TextGenerator = async (input) => {
    if (input.json === true) {
      calls.push({ kind: "bible", target: 0 });
      return {
        text: JSON.stringify({
          rollingSummary: "summary so far",
          newFacts: [`fact-${calls.length}`],
          characters: [],
          contradictions: options.contradictions ?? [],
        }),
        finishReason: "stop",
      };
    }

    if (input.prompt.includes("ADDITIONAL LENGTH NEEDED")) {
      const target = numberAfter(/ADDITIONAL LENGTH NEEDED: about (\d+) words/, input.prompt);
      calls.push({ kind: "topup", target });
      return { text: words(Math.round(target * (options.topUpFactor ?? 1))), finishReason: "stop" };
    }

    if (input.prompt.includes("TEXT SO FAR")) {
      const remaining = numberAfter(/About (\d+) words are still needed/, input.prompt);
      calls.push({ kind: "continuation", target: remaining });
      return { text: words(remaining), finishReason: options.alwaysLength === true ? "length" : "stop" };
    }

    chunkCalls += 1;
    if (options.failOnChunkCall === chunkCalls) {
      throw new AppError({
        code: "test.flaky",
        category: "network",
        messageKey: "error.test",
        message: "flaky",
        recoverable: true,
        details: { retryable: true },
      });
    }

    const target = numberAfter(/about (\d+) words in total/, input.prompt);
    calls.push({ kind: "chunk", target });
    const total = Math.round(target * (options.chunkFactor ?? 1));

    if (options.alwaysLength === true) {
      return { text: words(10), finishReason: "length" };
    }
    if (options.lengthFirstChunk === true && !lengthUsed) {
      lengthUsed = true;
      return { text: words(Math.floor(total / 2)), finishReason: "length" };
    }
    return { text: words(total), finishReason: "stop" };
  };

  return { generate, calls };
}

const baseInput = { context, budget, outline };

describe("generateStory", () => {
  it("writes the whole story in chunks and hits the word budget", async () => {
    const { generate, calls } = makeFake();
    const snapshots: StoryProgress[] = [];

    const result = await generateStory(baseInput, generate, {
      maxScenesPerChunk: 2,
      onProgress: (progress) => {
        snapshots.push(progress);
      },
    });

    expect(result.progress.chunks.map((chunk) => [chunk.sceneStart, chunk.sceneEnd])).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
    expect(result.totalWords).toBe(420);
    expect(result.totalWords).toBeGreaterThanOrEqual(budget.minWords);
    expect(result.totalWords).toBeLessThanOrEqual(budget.maxWords);
    expect(result.progress.nextSceneIndex).toBe(5);
    expect(result.progress.flags).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(snapshots).toHaveLength(3);
    expect(calls.filter((call) => call.kind === "bible")).toHaveLength(3);
  });

  it("starts the bible with the characters named in the outline and keeps the summary", async () => {
    const { generate } = makeFake();
    const result = await generateStory(baseInput, generate, { maxScenesPerChunk: 5 });

    expect(result.progress.bible.characters).toEqual([{ name: "Asha", description: "" }]);
    expect(result.progress.rollingSummary).toBe("summary so far");
    expect(result.progress.bible.facts).toHaveLength(1);
  });

  it("continues automatically when the model stops at the token limit", async () => {
    const { generate, calls } = makeFake({ lengthFirstChunk: true });
    const result = await generateStory(baseInput, generate, { maxScenesPerChunk: 2 });

    expect(calls.map((call) => call.kind).slice(0, 3)).toEqual(["chunk", "continuation", "bible"]);
    expect(result.progress.chunks[0]?.words).toBe(168);
    expect(result.totalWords).toBe(420);
  });

  it("gives up after too many continuations", async () => {
    const { generate, calls } = makeFake({ alwaysLength: true });

    await expect(
      generateStory(baseInput, generate, { maxContinuationsPerChunk: 2 }),
    ).rejects.toMatchObject({ code: "story.continuation_limit" });
    expect(calls.filter((call) => call.kind === "continuation")).toHaveLength(2);
  });

  it("makes up for short chunks in the following chunks", async () => {
    const { generate, calls } = makeFake({ chunkFactor: 0.5 });
    await generateStory(baseInput, generate, { maxScenesPerChunk: 2 });

    const targets = calls.filter((call) => call.kind === "chunk").map((call) => call.target);
    expect(targets[0]).toBe(168);
    expect(targets[1]).toBeGreaterThan(168);
  });

  it("adds a top-up pass when the finished story is still too short", async () => {
    const { generate, calls } = makeFake({ chunkFactor: 0.5 });
    const result = await generateStory(baseInput, generate, { maxScenesPerChunk: 2 });

    expect(calls.filter((call) => call.kind === "topup")).toHaveLength(1);
    expect(result.progress.chunks).toHaveLength(4);
    expect(result.totalWords).toBeGreaterThanOrEqual(budget.minWords);
  });

  it("fails with under_budget after the top-ups are used up and keeps the saved progress", async () => {
    const { generate } = makeFake({ chunkFactor: 0.5, topUpFactor: 0.1 });
    const snapshots: StoryProgress[] = [];

    await expect(
      generateStory(baseInput, generate, {
        maxScenesPerChunk: 2,
        onProgress: (progress) => {
          snapshots.push(progress);
        },
      }),
    ).rejects.toMatchObject({ code: "story.under_budget" });

    expect(snapshots).toHaveLength(5);
  });

  it("resumes from saved progress without repeating finished chunks", async () => {
    const first = makeFake({ failOnChunkCall: 2 });
    const snapshots: StoryProgress[] = [];

    await expect(
      generateStory(baseInput, first.generate, {
        maxScenesPerChunk: 2,
        onProgress: (progress) => {
          snapshots.push(progress);
        },
      }),
    ).rejects.toMatchObject({ code: "test.flaky" });
    expect(snapshots).toHaveLength(1);

    const second = makeFake();
    const result = await generateStory({ ...baseInput, resume: snapshots[0] }, second.generate, {
      maxScenesPerChunk: 2,
    });

    expect(second.calls.filter((call) => call.kind === "chunk")).toHaveLength(2);
    expect(result.progress.chunks).toHaveLength(3);
    expect(result.progress.chunks[0]?.text).toBe(snapshots[0]?.chunks[0]?.text);
    expect(result.totalWords).toBeGreaterThanOrEqual(budget.minWords);
  });

  it("refuses to resume with a different duration (duration lock)", async () => {
    const { generate } = makeFake();
    const snapshots: StoryProgress[] = [];
    await generateStory(baseInput, generate, {
      onProgress: (progress) => {
        snapshots.push(progress);
      },
    });

    const longer = planBudget({ durationMin: 5, language: "en" });
    await expect(
      generateStory({ context, budget: longer, outline, resume: snapshots[0] }, generate),
    ).rejects.toMatchObject({ code: "story.duration_locked" });
  });

  it("records continuity contradictions as flags with their chunk", async () => {
    const { generate } = makeFake({ contradictions: ["Asha's eyes changed colour"] });
    const result = await generateStory(baseInput, generate, { maxScenesPerChunk: 2 });

    expect(result.progress.flags).toEqual([
      { chunkIndex: 0, description: "Asha's eyes changed colour" },
      { chunkIndex: 1, description: "Asha's eyes changed colour" },
      { chunkIndex: 2, description: "Asha's eyes changed colour" },
    ]);
    expect(result.warnings).toContain("continuity_flags:3");
  });

  it("stops when the signal is aborted", async () => {
    const { generate, calls } = makeFake();
    const controller = new AbortController();
    controller.abort();

    await expect(generateStory(baseInput, generate, { signal: controller.signal })).rejects.toMatchObject({
      code: "story.cancelled",
    });
    expect(calls).toHaveLength(0);
  });
});

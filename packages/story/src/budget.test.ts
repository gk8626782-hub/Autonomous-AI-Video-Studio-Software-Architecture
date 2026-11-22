import { describe, expect, it } from "vitest";
import { planBudget } from "./budget";

describe("planBudget", () => {
  it("plans words and scenes from the duration", () => {
    expect(planBudget({ durationMin: 10, language: "en" })).toEqual({
      durationMin: 10,
      language: "en",
      targetWords: 1050,
      minWords: 945,
      maxWords: 1155,
      sceneCount: 13,
      avgSceneSec: 45,
      wordsPerScene: 81,
    });
  });

  it("uses the language speed and the genre scene length", () => {
    const hindi = planBudget({ durationMin: 30, language: "hi" });
    expect(hindi.targetWords).toBe(2700);

    const cartoon = planBudget({ durationMin: 5, language: "en", genre: "cartoon" });
    expect(cartoon.avgSceneSec).toBe(30);
    expect(cartoon.sceneCount).toBe(10);
  });

  it("allows custom speed, speech ratio, scene length and tolerance", () => {
    const budget = planBudget({
      durationMin: 2,
      language: "en",
      wordsPerMinute: { en: 100 },
      speechRatio: 0.5,
      avgSceneSec: 20,
      tolerance: 0.2,
    });
    expect(budget).toMatchObject({ targetWords: 100, minWords: 80, maxWords: 120, sceneCount: 6 });
  });

  it("is frozen so the locked plan cannot be changed", () => {
    const budget = planBudget({ durationMin: 1, language: "en" });
    expect(Object.isFrozen(budget)).toBe(true);
  });

  it("rejects durations outside 1-240 minutes and invalid settings", () => {
    for (const durationMin of [0, 241, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => planBudget({ durationMin, language: "en" })).toThrowError(/Duration/);
    }
    expect(() => planBudget({ durationMin: 5, language: "en", speechRatio: 0 })).toThrowError(/Speech ratio/);
    expect(() => planBudget({ durationMin: 5, language: "en", tolerance: 0.6 })).toThrowError(/Tolerance/);
    expect(() => planBudget({ durationMin: 5, language: "en", avgSceneSec: 0 })).toThrowError(/Scene length/);
    expect(() => planBudget({ durationMin: 5, language: "en", wordsPerMinute: { en: 0 } })).toThrowError(
      /Words per minute/,
    );
  });
});

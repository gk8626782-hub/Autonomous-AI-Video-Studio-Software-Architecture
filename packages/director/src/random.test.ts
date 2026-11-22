import { describe, expect, it } from "vitest";
import { createRng, hashString, pickWeighted } from "./random";

describe("hashString", () => {
  it("is stable and differs for different text", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(hashString("")).toBe(0x811c9dc5);
  });
});

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng("seed");
    const b = createRng("seed");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives different sequences for different seeds", () => {
    expect(createRng("one")()).not.toBe(createRng("two")());
  });

  it("stays within [0, 1)", () => {
    const rng = createRng("range");
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("pickWeighted", () => {
  it("never picks an option with zero weight", () => {
    const rng = createRng("zero");
    for (let i = 0; i < 200; i += 1) {
      expect(pickWeighted({ a: 1, b: 0, c: 0 }, rng)).toBe("a");
    }
  });

  it("follows the weights over many picks", () => {
    const rng = createRng("distribution");
    let a = 0;
    for (let i = 0; i < 4000; i += 1) {
      if (pickWeighted({ a: 0.7, b: 0.3 }, rng) === "a") {
        a += 1;
      }
    }
    expect(a / 4000).toBeGreaterThan(0.65);
    expect(a / 4000).toBeLessThan(0.75);
  });

  it("returns the first option when every weight is zero", () => {
    expect(pickWeighted({ first: 0, second: 0 }, () => 0.5)).toBe("first");
  });

  it("throws when there are no options", () => {
    expect(() => pickWeighted({}, () => 0.5)).toThrowError(/at least one option/);
  });
});

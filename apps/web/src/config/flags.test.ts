import { describe, expect, it } from "vitest";
import { readFlag } from "./flags";

describe("readFlag", () => {
  it("uses the fallback when the value is missing or empty", () => {
    expect(readFlag(undefined, false)).toBe(false);
    expect(readFlag(undefined, true)).toBe(true);
    expect(readFlag("", true)).toBe(true);
  });

  it("switches on only for true or 1", () => {
    expect(readFlag("true", false)).toBe(true);
    expect(readFlag("1", false)).toBe(true);
    expect(readFlag("false", true)).toBe(false);
    expect(readFlag("0", true)).toBe(false);
    expect(readFlag("yes", false)).toBe(false);
  });
});

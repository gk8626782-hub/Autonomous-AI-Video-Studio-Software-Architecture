import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertNamespaces,
  findNamespaceViolations,
  isNamespace,
  namespaceOf,
  type AssertPrefixed,
} from "./namespaces";

describe("namespaces", () => {
  it("recognizes core and extra namespaces", () => {
    expect(isNamespace("story")).toBe(true);
    expect(isNamespace("vault")).toBe(true);
    expect(isNamespace("nope")).toBe(false);
  });

  it("resolves the namespace of a key", () => {
    expect(namespaceOf("story_durationMin")).toBe("story");
    expect(namespaceOf("audio_voiceVolume")).toBe("audio");
    expect(namespaceOf("durationMin")).toBeUndefined();
    expect(namespaceOf("unknown_key")).toBeUndefined();
    expect(namespaceOf("_story")).toBeUndefined();
  });

  it("accepts correctly prefixed slices", () => {
    expect(() =>
      assertNamespaces({
        story: { story_title: "", story_setTitle: () => undefined },
        char: { char_list: [] },
      }),
    ).not.toThrow();
  });

  it("reports unprefixed, wrong-namespace and duplicate keys", () => {
    const violations = findNamespaceViolations({
      story: { story_title: "", title: "" },
      char: { story_title: "", char_list: [] },
    });
    const reasons = violations.map((v) => `${v.namespace}.${v.key}:${v.reason}`);
    expect(reasons).toContain("story.title:unprefixed");
    expect(reasons).toContain("char.story_title:wrong-namespace");
    expect(reasons).toContain("char.story_title:duplicate");
  });

  it("reports unknown namespaces", () => {
    const violations = findNamespaceViolations({ bogus: { bogus_a: 1 } });
    expect(violations).toEqual([{ namespace: "bogus", key: "*", reason: "unknown-namespace" }]);
  });

  it("throws a readable error on violations", () => {
    expect(() => assertNamespaces({ ui: { theme: "dark" } })).toThrow(/ui\.theme \(unprefixed\)/);
  });

  it("guards slice types at compile time", () => {
    type Good = AssertPrefixed<"story", { story_a: number; story_b: string }>;
    type Bad = AssertPrefixed<"story", { story_a: number; other: string }>;
    expectTypeOf<Good>().not.toBeNever();
    expectTypeOf<Bad>().toBeNever();
  });
});

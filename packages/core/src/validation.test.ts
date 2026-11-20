import { describe, expect, it, vi } from "vitest";
import { ValidationRegistry, type ValidationRule } from "./validation";

function rule(partial: Partial<ValidationRule> & Pick<ValidationRule, "id">): ValidationRule {
  return {
    scope: "project:1",
    messageKey: `validation.${partial.id}`,
    isValid: () => true,
    ...partial,
  };
}

describe("ValidationRegistry", () => {
  it("is valid when no rule fails", () => {
    const registry = new ValidationRegistry();
    registry.register(rule({ id: "a" }));
    expect(registry.isValid()).toBe(true);
    expect(registry.firstIssue()).toBeUndefined();
  });

  it("reports issues in registration order", () => {
    const registry = new ValidationRegistry();
    registry.register(rule({ id: "first", isValid: () => false, domPath: "#first" }));
    registry.register(rule({ id: "second", isValid: () => false }));

    const issues = registry.evaluate();
    expect(issues.map((i) => i.id)).toEqual(["first", "second"]);
    expect(registry.firstIssue()?.domPath).toBe("#first");
    expect(registry.isValid()).toBe(false);
  });

  it("honors the order field", () => {
    const registry = new ValidationRegistry();
    registry.register(rule({ id: "late", isValid: () => false, order: 5 }));
    registry.register(rule({ id: "early", isValid: () => false, order: 1 }));
    expect(registry.firstIssue()?.id).toBe("early");
  });

  it("filters by scope", () => {
    const registry = new ValidationRegistry();
    registry.register(rule({ id: "a", scope: "char:1", isValid: () => false }));
    registry.register(rule({ id: "b", scope: "char:2" }));
    expect(registry.isValid("char:2")).toBe(true);
    expect(registry.isValid("char:1")).toBe(false);
  });

  it("fails closed when a rule throws", () => {
    const registry = new ValidationRegistry();
    registry.register(
      rule({
        id: "broken",
        isValid: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(registry.isValid()).toBe(false);
  });

  it("rejects duplicate ids and supports unregistering", () => {
    const registry = new ValidationRegistry();
    const unregister = registry.register(rule({ id: "dup", isValid: () => false }));
    expect(() => registry.register(rule({ id: "dup" }))).toThrow(/already registered/);
    unregister();
    expect(registry.isValid()).toBe(true);
  });

  it("notifies subscribers on changes", () => {
    const registry = new ValidationRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    const unregister = registry.register(rule({ id: "a" }));
    unregister();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registry.register(rule({ id: "b" }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

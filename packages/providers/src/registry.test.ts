import { describe, expect, it } from "vitest";
import { MockAdapter } from "./mock";
import { ProviderRegistry } from "./registry";

describe("ProviderRegistry", () => {
  it("registers and finds adapters", () => {
    const registry = new ProviderRegistry();
    const a = new MockAdapter({ id: "alpha" });
    registry.register(a);

    expect(registry.get("alpha")).toBe(a);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.list()).toEqual([a]);
  });

  it("rejects duplicate ids", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockAdapter({ id: "alpha" }));
    expect(() => registry.register(new MockAdapter({ id: "alpha" }))).toThrowError(/already registered/);
  });

  it("rejects adapters with an invalid manifest", () => {
    const registry = new ProviderRegistry();
    expect(() => registry.register(new MockAdapter({ id: "Bad Id" }))).toThrowError(/Invalid adapter manifest/);
  });

  it("lists adapters by capability", () => {
    const registry = new ProviderRegistry();
    const textOnly = new MockAdapter({ id: "texty", capabilities: ["text"] });
    const full = new MockAdapter({ id: "full" });
    registry.register(textOnly);
    registry.register(full);

    expect(registry.list("text")).toEqual([textOnly, full]);
    expect(registry.list("video")).toEqual([full]);
  });

  it("builds a chain in preferred order and skips unknown or incapable adapters", () => {
    const registry = new ProviderRegistry();
    const textOnly = new MockAdapter({ id: "texty", capabilities: ["text"] });
    const full = new MockAdapter({ id: "full" });
    const other = new MockAdapter({ id: "other" });
    registry.register(textOnly);
    registry.register(full);
    registry.register(other);

    expect(registry.chainFor("video", ["texty", "other", "ghost", "full", "other"])).toEqual([other, full]);
    expect(registry.chainFor("video", [])).toEqual([]);
  });
});

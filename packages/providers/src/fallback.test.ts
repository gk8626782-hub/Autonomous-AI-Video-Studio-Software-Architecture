import { describe, expect, it } from "vitest";
import { AppError } from "@avs/core";
import { offlineError, providerError } from "./errors";
import { runWithFallback, shouldFallBack } from "./fallback";
import { MockAdapter } from "./mock";

const first = new MockAdapter({ id: "first" });
const second = new MockAdapter({ id: "second" });
const third = new MockAdapter({ id: "third" });

describe("shouldFallBack", () => {
  it("moves on for auth, quota, transient and bad output only", () => {
    expect(shouldFallBack(providerError("auth", { providerId: "p" }))).toBe(true);
    expect(shouldFallBack(providerError("quota", { providerId: "p" }))).toBe(true);
    expect(shouldFallBack(providerError("transient", { providerId: "p" }))).toBe(true);
    expect(shouldFallBack(providerError("bad_output", { providerId: "p" }))).toBe(true);
    expect(shouldFallBack(providerError("policy", { providerId: "p" }))).toBe(false);
    expect(shouldFallBack(providerError("cancelled", { providerId: "p" }))).toBe(false);
    expect(shouldFallBack(offlineError("p"))).toBe(false);
  });
});

describe("runWithFallback", () => {
  it("returns the first provider's result when it works", async () => {
    const result = await runWithFallback([first, second], async (adapter) => adapter.manifest.id);
    expect(result).toEqual({ providerId: "first", value: "first", failures: [] });
  });

  it("falls back after a quota error and reports the failure", async () => {
    const result = await runWithFallback([first, second, third], async (adapter) => {
      if (adapter.manifest.id === "first") {
        throw providerError("quota", { providerId: "first" });
      }
      return adapter.manifest.id;
    });

    expect(result.providerId).toBe("second");
    expect(result.failures.map((f) => f.providerId)).toEqual(["first"]);
    expect(result.failures[0]?.error.code).toBe("provider.quota");
  });

  it("stops at a policy refusal instead of trying other providers", async () => {
    const attempted: string[] = [];
    await expect(
      runWithFallback([first, second], async (adapter) => {
        attempted.push(adapter.manifest.id);
        throw providerError("policy", { providerId: adapter.manifest.id });
      }),
    ).rejects.toMatchObject({ code: "provider.policy" });
    expect(attempted).toEqual(["first"]);
  });

  it("stops when the network is offline", async () => {
    const attempted: string[] = [];
    await expect(
      runWithFallback([first, second], async (adapter) => {
        attempted.push(adapter.manifest.id);
        throw offlineError(adapter.manifest.id);
      }),
    ).rejects.toMatchObject({ code: "network.offline" });
    expect(attempted).toEqual(["first"]);
  });

  it("throws provider.all_failed with every attempt listed", async () => {
    try {
      await runWithFallback([first, second], async (adapter) => {
        throw providerError("transient", { providerId: adapter.manifest.id });
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      const failure = error as AppError;
      expect(failure.code).toBe("provider.all_failed");
      expect(failure.details?.["attempts"]).toEqual([
        { providerId: "first", code: "provider.transient" },
        { providerId: "second", code: "provider.transient" },
      ]);
    }
  });

  it("rejects an empty chain", async () => {
    await expect(runWithFallback([], async () => "x")).rejects.toMatchObject({
      code: "provider.none_available",
    });
  });
});

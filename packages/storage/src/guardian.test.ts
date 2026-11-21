import { describe, expect, it } from "vitest";
import { assessStorage, estimateRequiredBytes } from "./guardian";
import { readStorageEstimate, requestPersistence } from "./storage-env";

describe("assessStorage", () => {
  const base = { quotaBytes: 1000, usageBytes: 100 };

  it("is ok when there is plenty of room", () => {
    expect(assessStorage({ ...base, neededBytes: 500 })).toEqual({
      level: "ok",
      neededBytes: 500,
      availableBytes: 810,
      shortfallBytes: 0,
    });
  });

  it("warns when the need is close to the available space", () => {
    expect(assessStorage({ ...base, neededBytes: 700 }).level).toBe("warn");
  });

  it("blocks and reports the shortfall when space is insufficient", () => {
    expect(assessStorage({ ...base, neededBytes: 900 })).toMatchObject({
      level: "block",
      shortfallBytes: 90,
    });
  });

  it("blocks when the quota is already used up", () => {
    expect(assessStorage({ quotaBytes: 100, usageBytes: 200, neededBytes: 1 }).level).toBe("block");
  });

  it("honors custom margin and warn ratio", () => {
    const result = assessStorage({ ...base, neededBytes: 450, safetyMargin: 0, warnRatio: 0.5 });
    expect(result.availableBytes).toBe(900);
    expect(result.level).toBe("ok");
    expect(assessStorage({ ...base, neededBytes: 460, safetyMargin: 0, warnRatio: 0.5 }).level).toBe("warn");
  });

  it("rejects invalid input", () => {
    expect(() => assessStorage({ ...base, neededBytes: -1 })).toThrowError(/neededBytes/);
    expect(() => assessStorage({ ...base, neededBytes: Number.NaN })).toThrowError(/neededBytes/);
  });
});

describe("estimateRequiredBytes", () => {
  it("adds clips, temporary files and the export", () => {
    expect(estimateRequiredBytes({ plannedClipBytes: 1000, expectedFinalBytes: 100 })).toBe(1300);
  });

  it("supports a custom temporary factor", () => {
    expect(estimateRequiredBytes({ plannedClipBytes: 0, expectedFinalBytes: 100, tempFactor: 1 })).toBe(200);
  });
});

describe("readStorageEstimate", () => {
  it("returns quota and usage", async () => {
    const manager = { estimate: async () => ({ quota: 1000, usage: 250 }) };
    expect(await readStorageEstimate(manager)).toEqual({ quotaBytes: 1000, usageBytes: 250 });
  });

  it("returns null when unknown or failing", async () => {
    expect(await readStorageEstimate(undefined)).toBeNull();
    expect(await readStorageEstimate({ estimate: async () => ({}) })).toBeNull();
    expect(
      await readStorageEstimate({
        estimate: async () => {
          throw new Error("boom");
        },
      }),
    ).toBeNull();
  });
});

describe("requestPersistence", () => {
  const estimate = async () => ({});

  it("is unsupported without persist()", async () => {
    expect(await requestPersistence({ estimate })).toBe("unsupported");
    expect(await requestPersistence(undefined)).toBe("unsupported");
  });

  it("is granted when already persisted or when persist() succeeds", async () => {
    expect(await requestPersistence({ estimate, persist: async () => false, persisted: async () => true })).toBe(
      "granted",
    );
    expect(await requestPersistence({ estimate, persist: async () => true })).toBe("granted");
  });

  it("is denied when the browser refuses or throws", async () => {
    expect(await requestPersistence({ estimate, persist: async () => false })).toBe("denied");
    expect(
      await requestPersistence({
        estimate,
        persist: async () => {
          throw new Error("boom");
        },
      }),
    ).toBe("denied");
  });
});

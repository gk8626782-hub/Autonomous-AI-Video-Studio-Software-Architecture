import { describe, expect, it } from "vitest";
import { OFFLINE_ERROR_CODE, isRetryableError } from "@avs/core";
import { classifyHttpStatus, normalizeTransportError, offlineError, providerError } from "./errors";

describe("providerError", () => {
  it("maps kinds to categories and retry flags", () => {
    const transient = providerError("transient", { providerId: "p" });
    expect(transient.category).toBe("network");
    expect(transient.code).toBe("provider.transient");
    expect(isRetryableError(transient)).toBe(true);

    expect(providerError("bad_output", { providerId: "p" }).category).toBe("media");
    expect(isRetryableError(providerError("bad_output", { providerId: "p" }))).toBe(true);

    for (const kind of ["auth", "quota", "policy", "cancelled"] as const) {
      expect(isRetryableError(providerError(kind, { providerId: "p" }))).toBe(false);
    }
    expect(providerError("auth", { providerId: "p" }).category).toBe("auth");
    expect(providerError("quota", { providerId: "p" }).category).toBe("quota");
    expect(providerError("policy", { providerId: "p" }).category).toBe("policy");
  });

  it("records provider id, status and cause", () => {
    const cause = new Error("root");
    const error = providerError("auth", { providerId: "gem", httpStatus: 401, cause });
    expect(error.details).toMatchObject({ kind: "auth", providerId: "gem", httpStatus: 401 });
    expect(error.params).toEqual({ provider: "gem" });
    expect(error.cause).toBe(cause);
    expect(error.recoverable).toBe(true);
    expect(providerError("cancelled", { providerId: "p" }).recoverable).toBe(false);
  });
});

describe("offlineError", () => {
  it("uses the shared offline code and is not retried with backoff", () => {
    const error = offlineError("p");
    expect(error.code).toBe(OFFLINE_ERROR_CODE);
    expect(isRetryableError(error)).toBe(false);
  });
});

describe("classifyHttpStatus", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [402, "quota"],
    [408, "transient"],
    [429, "transient"],
    [500, "transient"],
    [503, "transient"],
  ] as const)("maps %i to %s", (status, kind) => {
    expect(classifyHttpStatus(status)).toBe(kind);
  });

  it("leaves other statuses to the caller", () => {
    expect(classifyHttpStatus(200)).toBeNull();
    expect(classifyHttpStatus(400)).toBeNull();
    expect(classifyHttpStatus(404)).toBeNull();
  });
});

describe("normalizeTransportError", () => {
  it("passes AppError values through", () => {
    const original = providerError("quota", { providerId: "p" });
    expect(normalizeTransportError("p", original)).toBe(original);
  });

  it("maps aborts to cancelled", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(normalizeTransportError("p", abort, () => true).code).toBe("provider.cancelled");
  });

  it("reports offline when there is no connection", () => {
    expect(normalizeTransportError("p", new TypeError("fetch failed"), () => false).code).toBe(
      OFFLINE_ERROR_CODE,
    );
  });

  it("treats other failures while online as transient", () => {
    const error = normalizeTransportError("p", new TypeError("fetch failed"), () => true);
    expect(error.code).toBe("provider.transient");
  });
});

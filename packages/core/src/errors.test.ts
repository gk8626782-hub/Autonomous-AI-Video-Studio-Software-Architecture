import { describe, expect, it } from "vitest";
import { AppError, isAppError, toAppError } from "./errors";

describe("AppError", () => {
  it("carries code, category, i18n key and cause", () => {
    const cause = new Error("root");
    const error = new AppError({
      code: "storage.quota_exceeded",
      category: "storage",
      messageKey: "error.storage.quota",
      message: "Not enough storage",
      recoverable: true,
      params: { neededMb: 2500 },
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("storage.quota_exceeded");
    expect(error.category).toBe("storage");
    expect(error.messageKey).toBe("error.storage.quota");
    expect(error.recoverable).toBe(true);
    expect(error.params).toEqual({ neededMb: 2500 });
    expect(error.cause).toBe(cause);
  });

  it("keeps AppError instances unchanged in toAppError", () => {
    const error = new AppError({
      code: "auth.invalid_key",
      category: "auth",
      messageKey: "error.auth.invalidKey",
      message: "Invalid key",
      recoverable: true,
    });
    expect(isAppError(error)).toBe(true);
    expect(toAppError(error)).toBe(error);
  });

  it("wraps unknown values into a generic AppError", () => {
    const wrapped = toAppError("boom");
    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.category).toBe("unknown");
    expect(wrapped.code).toBe("unknown.unhandled");
    expect(wrapped.cause).toBe("boom");
  });
});

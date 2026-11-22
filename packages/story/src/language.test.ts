import { describe, expect, it } from "vitest";
import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("detects Hindi, English and Hinglish by script", () => {
    expect(detectLanguage("यह एक बहुत लंबी कहानी है ok")).toBe("hi");
    expect(detectLanguage("This is a story about a brave girl")).toBe("en");
    expect(detectLanguage("यह story है और बहुत अच्छी")).toBe("hinglish");
  });

  it("returns unknown when there are no letters", () => {
    expect(detectLanguage("")).toBe("unknown");
    expect(detectLanguage("1234 !!! ???")).toBe("unknown");
  });
});

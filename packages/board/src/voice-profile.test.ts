import { describe, expect, it } from "vitest";
import { deriveVoiceProfile, voiceDesignPrompt, withVoiceOverrides } from "./voice-profile";

const source = (overrides: Partial<Parameters<typeof deriveVoiceProfile>[0]> = {}) => ({
  species: "human",
  ageGroup: "adult",
  gender: "unknown",
  voiceTraits: "",
  ...overrides,
});

describe("deriveVoiceProfile", () => {
  it("derives humans from age and gender", () => {
    expect(deriveVoiceProfile(source({ ageGroup: "elder", gender: "male" }))).toMatchObject({
      pitch: "low",
      pace: "slow",
      treatment: "human",
      description: "elderly male human voice, low pitch, slow pace",
    });
    expect(deriveVoiceProfile(source({ ageGroup: "child" }))).toMatchObject({ pitch: "high", pace: "fast" });
    expect(deriveVoiceProfile(source({ ageGroup: "adult", gender: "female" }))).toMatchObject({
      pitch: "medium",
      pace: "normal",
    });
    expect(deriveVoiceProfile(source({ ageGroup: "teen", gender: "female" })).pitch).toBe("high");
  });

  it("treats an empty species as human", () => {
    expect(deriveVoiceProfile(source({ species: "" })).treatment).toBe("human");
  });

  it("derives animals from the species", () => {
    expect(deriveVoiceProfile(source({ species: "elephant" }))).toMatchObject({
      treatment: "animal",
      pitch: "very_low",
      pace: "slow",
    });
    expect(deriveVoiceProfile(source({ species: "Mouse" }))).toMatchObject({ pitch: "very_high", pace: "fast" });
    expect(deriveVoiceProfile(source({ species: "golden retriever dog" }))).toMatchObject({
      treatment: "animal",
      pitch: "low",
    });
    expect(deriveVoiceProfile(source({ species: "puppy" }))).toMatchObject({ treatment: "animal", pitch: "medium" });
  });

  it("recognizes robots and fantasy creatures", () => {
    expect(deriveVoiceProfile(source({ species: "robot" }))).toMatchObject({ treatment: "robot", pitch: "medium" });
    const dragon = deriveVoiceProfile(source({ species: "dragon", gender: "male" }));
    expect(dragon.treatment).toBe("creature");
    expect(dragon.description).toContain("dragon fantasy character voice");
  });

  it("lets voice traits nudge pitch and pace", () => {
    expect(deriveVoiceProfile(source({ gender: "male", voiceTraits: "deep gruff voice" })).pitch).toBe("very_low");
    expect(deriveVoiceProfile(source({ gender: "female", voiceTraits: "squeaky" })).pitch).toBe("high");
    expect(deriveVoiceProfile(source({ ageGroup: "elder", voiceTraits: "energetic" })).pace).toBe("normal");
    expect(deriveVoiceProfile(source({ voiceTraits: "slow and calm" })).pace).toBe("slow");
  });

  it("never goes beyond the lowest or highest pitch", () => {
    expect(deriveVoiceProfile(source({ species: "elephant", voiceTraits: "deep" })).pitch).toBe("very_low");
    expect(deriveVoiceProfile(source({ species: "mouse", voiceTraits: "squeaky" })).pitch).toBe("very_high");
  });
});

describe("voice overrides and design prompt", () => {
  it("applies user edits", () => {
    const profile = deriveVoiceProfile(source());
    const edited = withVoiceOverrides(profile, { pitch: "high", accent: "Rajasthani", emotion: "cheerful" });

    expect(edited).toMatchObject({ pitch: "high", accent: "Rajasthani", emotion: "cheerful" });
    expect(profile.accent).toBeNull();
  });

  it("builds a prompt for voice design", () => {
    const profile = withVoiceOverrides(deriveVoiceProfile(source({ ageGroup: "elder", gender: "male" })), {
      accent: "Rajasthani",
    });
    const prompt = voiceDesignPrompt(profile, "Hindi");

    expect(prompt).toContain("elderly male human voice");
    expect(prompt).toContain("Accent: Rajasthani");
    expect(prompt).toContain("storytelling in Hindi");
  });
});

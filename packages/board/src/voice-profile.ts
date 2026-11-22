export const PITCHES = ["very_low", "low", "medium", "high", "very_high"] as const;
export type Pitch = (typeof PITCHES)[number];

export const PACES = ["slow", "normal", "fast"] as const;
export type Pace = (typeof PACES)[number];

export type VoiceTreatment = "human" | "animal" | "robot" | "creature";

export interface VoiceSource {
  readonly species: string;
  readonly ageGroup: string;
  readonly gender: string;
  readonly voiceTraits: string;
}

/** Editable description of how a character should sound. */
export interface VoiceProfile {
  readonly pitch: Pitch;
  readonly pace: Pace;
  readonly treatment: VoiceTreatment;
  readonly description: string;
  readonly accent: string | null;
  readonly emotion: string;
}

const HUMAN_WORDS: ReadonlySet<string> = new Set([
  "human",
  "person",
  "man",
  "woman",
  "boy",
  "girl",
  "child",
  "villager",
]);
const ROBOT_WORDS: ReadonlySet<string> = new Set(["robot", "android", "machine", "cyborg", "droid"]);

interface VoiceBase {
  readonly pitch: Pitch;
  readonly pace: Pace;
}

/** Starting points for animals. Everything here can be edited by the user later. */
const ANIMAL_VOICES: Readonly<Record<string, VoiceBase>> = {
  elephant: { pitch: "very_low", pace: "slow" },
  bear: { pitch: "very_low", pace: "slow" },
  buffalo: { pitch: "very_low", pace: "slow" },
  hippo: { pitch: "very_low", pace: "slow" },
  lion: { pitch: "very_low", pace: "normal" },
  tiger: { pitch: "very_low", pace: "normal" },
  dog: { pitch: "low", pace: "normal" },
  wolf: { pitch: "low", pace: "normal" },
  horse: { pitch: "low", pace: "normal" },
  crow: { pitch: "low", pace: "normal" },
  cow: { pitch: "low", pace: "slow" },
  owl: { pitch: "low", pace: "slow" },
  fox: { pitch: "medium", pace: "fast" },
  cat: { pitch: "high", pace: "normal" },
  deer: { pitch: "high", pace: "slow" },
  rabbit: { pitch: "high", pace: "fast" },
  monkey: { pitch: "high", pace: "fast" },
  parrot: { pitch: "high", pace: "fast" },
  mouse: { pitch: "very_high", pace: "fast" },
  bird: { pitch: "very_high", pace: "fast" },
  sparrow: { pitch: "very_high", pace: "fast" },
  squirrel: { pitch: "very_high", pace: "fast" },
};
const OTHER_ANIMAL_WORDS: ReadonlySet<string> = new Set(["puppy", "kitten", "cub", "calf", "bunny", "goat", "sheep"]);

function humanBase(ageGroup: string, gender: string): VoiceBase {
  if (ageGroup === "child") {
    return { pitch: "high", pace: "fast" };
  }
  if (ageGroup === "teen") {
    return { pitch: gender === "female" ? "high" : "medium", pace: "normal" };
  }
  const pitch: Pitch = gender === "male" ? "low" : "medium";
  return { pitch, pace: ageGroup === "elder" ? "slow" : "normal" };
}

function shiftPitch(pitch: Pitch, delta: number): Pitch {
  const index = PITCHES.indexOf(pitch) + delta;
  return PITCHES[Math.min(PITCHES.length - 1, Math.max(0, index))] ?? pitch;
}

function shiftPace(pace: Pace, delta: number): Pace {
  const index = PACES.indexOf(pace) + delta;
  return PACES[Math.min(PACES.length - 1, Math.max(0, index))] ?? pace;
}

function ageWord(ageGroup: string): string {
  switch (ageGroup) {
    case "child":
      return "child";
    case "teen":
      return "teenage";
    case "adult":
      return "adult";
    case "elder":
      return "elderly";
    default:
      return "";
  }
}

function genderWord(gender: string): string {
  return gender === "male" || gender === "female" ? gender : "";
}

function describeVoice(source: VoiceSource, treatment: VoiceTreatment, pitch: Pitch, pace: Pace): string {
  const species = source.species.trim();
  let subject: string;
  switch (treatment) {
    case "human":
      subject = `${ageWord(source.ageGroup)} ${genderWord(source.gender)} human voice`.replace(/\s+/g, " ").trim();
      break;
    case "robot":
      subject = "robot character voice";
      break;
    case "animal":
      subject = `${species === "" ? "animal" : species} character voice`;
      break;
    default:
      subject = `${species === "" ? "fantasy" : species} fantasy character voice`;
  }
  return `${subject}, ${pitch.replace("_", " ")} pitch, ${pace} pace`;
}

/**
 * Derives a starting voice from who the character is. Words in voiceTraits
 * (for example "deep", "squeaky", "slow") then nudge pitch and pace.
 */
export function deriveVoiceProfile(source: VoiceSource): VoiceProfile {
  const tokens = source.species
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token !== "");

  let treatment: VoiceTreatment;
  let base: VoiceBase;

  const animal = tokens.map((token) => ANIMAL_VOICES[token]).find((voice) => voice !== undefined);

  if (tokens.some((token) => ROBOT_WORDS.has(token))) {
    treatment = "robot";
    base = { pitch: "medium", pace: "normal" };
  } else if (tokens.length === 0 || tokens.some((token) => HUMAN_WORDS.has(token))) {
    treatment = "human";
    base = humanBase(source.ageGroup, source.gender);
  } else if (animal !== undefined) {
    treatment = "animal";
    base = animal;
  } else if (tokens.some((token) => OTHER_ANIMAL_WORDS.has(token))) {
    treatment = "animal";
    base = { pitch: "medium", pace: "normal" };
  } else {
    treatment = "creature";
    base = humanBase(source.ageGroup, source.gender);
  }

  const traits = source.voiceTraits.toLowerCase();
  let pitch = base.pitch;
  let pace = base.pace;
  if (/\b(deep|low|gruff|booming|bass)\b/.test(traits)) pitch = shiftPitch(pitch, -1);
  if (/\b(high|squeaky|shrill|thin|piping)\b/.test(traits)) pitch = shiftPitch(pitch, 1);
  if (/\b(slow|calm|gentle|measured|soft)\b/.test(traits)) pace = shiftPace(pace, -1);
  if (/\b(fast|quick|energetic|hurried|excited)\b/.test(traits)) pace = shiftPace(pace, 1);

  return {
    pitch,
    pace,
    treatment,
    description: describeVoice(source, treatment, pitch, pace),
    accent: null,
    emotion: "neutral",
  };
}

export function withVoiceOverrides(
  profile: VoiceProfile,
  overrides: Partial<Pick<VoiceProfile, "pitch" | "pace" | "accent" | "emotion">>,
): VoiceProfile {
  return { ...profile, ...overrides };
}

/** Text prompt for providers that can design a voice from a description. */
export function voiceDesignPrompt(profile: VoiceProfile, languageName: string): string {
  const accent = profile.accent === null || profile.accent === "" ? "" : ` Accent: ${profile.accent}.`;
  return `Create a voice: ${profile.description}.${accent} Emotion: ${profile.emotion}. Clear articulation, suitable for storytelling in ${languageName}.`;
}

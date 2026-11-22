import { GENRES, TRADITIONS } from "@avs/story";
import { z } from "zod";

export const SHOT_TYPES = [
  "wide",
  "medium",
  "close_up",
  "extreme_close_up",
  "over_shoulder",
  "insert",
  "symbolic",
] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const CAMERA_MOTIONS = [
  "static",
  "slow_pan",
  "push_in",
  "pull_out",
  "handheld",
  "parallax",
  "orbit",
] as const;
export type CameraMotion = (typeof CAMERA_MOTIONS)[number];

export const TRANSITIONS = ["cut", "dissolve", "fade", "whip", "wipe", "match_cut"] as const;
export type Transition = (typeof TRANSITIONS)[number];

/** Ways to show a figure without depicting them directly. */
export const SYMBOLIC_KINDS = ["light", "symbols", "hands", "voice_over"] as const;
export type SymbolicKind = (typeof SYMBOLIC_KINDS)[number];

const share = z.number().min(0).max(1);
const signed = z.number().min(-1).max(1);
const fieldOfView = z.number().min(20).max(120);

const profileObject = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  genre: z.enum(GENRES),
  tradition: z.enum(TRADITIONS).nullable(),
  visual: z.object({
    styleHint: z.string().min(1).max(600),
    negativePrompt: z.string().max(400),
    palette: z
      .array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
      .min(1)
      .max(8),
    characterRendering: z.enum(["flat_outline", "cel_shaded", "painterly", "realistic", "stylized_3d"]),
  }),
  shots: z.object({
    avgShotSec: z.number().positive(),
    minShotSec: z.number().positive(),
    maxShotSec: z.number().positive(),
    /** Start every scene with a wide shot of the place. */
    establishing: z.boolean(),
    dialogueCoverage: z.enum(["shot_reverse_shot", "two_shot", "single"]),
    overShoulderRatio: share,
    closeUpOnEmotion: z.boolean(),
    shotWeights: z.object({
      wide: share,
      medium: share,
      close_up: share,
      extreme_close_up: share,
      insert: share,
    }),
    motionWeights: z.object({
      static: share,
      slow_pan: share,
      push_in: share,
      pull_out: share,
      handheld: share,
      parallax: share,
      orbit: share,
    }),
    fov: z.object({
      wide: fieldOfView,
      medium: fieldOfView,
      close_up: fieldOfView,
      extreme_close_up: fieldOfView,
      over_shoulder: fieldOfView,
      insert: fieldOfView,
      symbolic: fieldOfView,
    }),
  }),
  transitions: z.object({
    within: z.enum(TRANSITIONS),
    between: z.enum(TRANSITIONS),
    sec: z.number().min(0).max(3),
  }),
  grade: z.object({
    contrast: signed,
    saturation: signed,
    warmth: signed,
    grain: share,
    vignette: share,
  }),
  audio: z.object({
    musicMood: z.array(z.string().min(1)).min(1),
    sfxDensity: z.enum(["low", "medium", "high"]),
    voiceStyle: z.string().min(1),
    musicDuckDb: z.number().min(-40).max(0),
    targetLufs: z.number().min(-30).max(-6),
  }),
  subtitles: z.object({
    fontFamily: z.string().min(1),
    sizeRatio: z.number().min(0.02).max(0.12),
    position: z.enum(["bottom", "center", "top"]),
    maxCharsPerLine: z.number().int().min(10).max(80),
    maxLines: z.number().int().min(1).max(3),
    readingWpm: z.number().min(60).max(300),
  }),
  sensitivity: z.object({
    /** When true, figures marked as restricted are never shown directly. */
    restrictDirectDepiction: z.boolean(),
    symbolicTreatments: z.array(z.enum(SYMBOLIC_KINDS)),
    notes: z.string().max(400),
  }),
});

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

export const profileSchema = profileObject.superRefine((profile, ctx) => {
  const { avgShotSec, minShotSec, maxShotSec } = profile.shots;
  if (!(minShotSec <= avgShotSec && avgShotSec <= maxShotSec)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shots", "avgShotSec"],
      message: "Shot lengths must satisfy min <= avg <= max",
    });
  }
  if (sum(Object.values(profile.shots.shotWeights)) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shots", "shotWeights"],
      message: "At least one shot weight must be above zero",
    });
  }
  if (sum(Object.values(profile.shots.motionWeights)) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shots", "motionWeights"],
      message: "At least one motion weight must be above zero",
    });
  }
  if (profile.sensitivity.restrictDirectDepiction && profile.sensitivity.symbolicTreatments.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sensitivity", "symbolicTreatments"],
      message: "A profile that restricts depiction needs at least one symbolic treatment",
    });
  }
});

/** A profile where every field, at every level, may be left out. Used for tradition overrides. */
export const overrideSchema = profileObject.deepPartial();

export type GenreProfile = z.output<typeof profileSchema>;
export type ProfileOverride = z.output<typeof overrideSchema>;

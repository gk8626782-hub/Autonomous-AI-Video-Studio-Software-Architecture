import type { Genre, Tradition } from "@avs/story";
import type { GenreProfile, ProfileOverride } from "./schema";

/**
 * Built-in profiles. Every number here is a starting value to be tuned by
 * looking at real generated videos. New profiles are added as data only.
 */

const FONT_STACK = "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif";

function fov(
  wide: number,
  medium: number,
  closeUp: number,
  extreme: number,
  overShoulder: number,
  insert: number,
  symbolic: number,
): GenreProfile["shots"]["fov"] {
  return {
    wide,
    medium,
    close_up: closeUp,
    extreme_close_up: extreme,
    over_shoulder: overShoulder,
    insert,
    symbolic,
  };
}

export const BASE_PROFILES: Readonly<Record<Genre, GenreProfile>> = {
  cartoon: {
    id: "cartoon",
    version: 1,
    genre: "cartoon",
    tradition: null,
    visual: {
      styleHint:
        "bright flat colors, bold clean outlines, expressive characters, 2D cartoon style, soft simple shading",
      negativePrompt: "photorealistic, dark, gritty, blurry, text, watermark",
      palette: ["#FFD23F", "#3BCEAC", "#EE4266", "#540D6E"],
      characterRendering: "flat_outline",
    },
    shots: {
      avgShotSec: 3.5,
      minShotSec: 1.5,
      maxShotSec: 6,
      establishing: true,
      dialogueCoverage: "shot_reverse_shot",
      overShoulderRatio: 0.1,
      closeUpOnEmotion: true,
      shotWeights: { wide: 0.3, medium: 0.5, close_up: 0.15, extreme_close_up: 0.02, insert: 0.05 },
      motionWeights: { static: 0.2, slow_pan: 0.1, push_in: 0.2, pull_out: 0.1, handheld: 0, parallax: 0.3, orbit: 0.1 },
      fov: fov(95, 70, 50, 35, 62, 45, 70),
    },
    transitions: { within: "cut", between: "wipe", sec: 0.3 },
    grade: { contrast: 0.2, saturation: 0.5, warmth: 0.1, grain: 0, vignette: 0 },
    audio: {
      musicMood: ["playful", "upbeat"],
      sfxDensity: "high",
      voiceStyle: "expressive and animated",
      musicDuckDb: -14,
      targetLufs: -14,
    },
    subtitles: {
      fontFamily: FONT_STACK,
      sizeRatio: 0.055,
      position: "bottom",
      maxCharsPerLine: 32,
      maxLines: 2,
      readingWpm: 160,
    },
    sensitivity: { restrictDirectDepiction: false, symbolicTreatments: [], notes: "" },
  },

  bollywood: {
    id: "bollywood",
    version: 1,
    genre: "bollywood",
    tradition: null,
    visual: {
      styleHint:
        "rich saturated colors, dramatic lighting, cinematic Indian film look, expressive faces, lavish sets and costumes",
      negativePrompt: "flat, low detail, cartoon, text, watermark",
      palette: ["#C1121F", "#FFB703", "#023047", "#8338EC"],
      characterRendering: "realistic",
    },
    shots: {
      avgShotSec: 4.5,
      minShotSec: 2,
      maxShotSec: 8,
      establishing: true,
      dialogueCoverage: "shot_reverse_shot",
      overShoulderRatio: 0.15,
      closeUpOnEmotion: true,
      shotWeights: { wide: 0.2, medium: 0.35, close_up: 0.3, extreme_close_up: 0.1, insert: 0.05 },
      motionWeights: { static: 0.1, slow_pan: 0.15, push_in: 0.35, pull_out: 0.1, handheld: 0.05, parallax: 0.1, orbit: 0.15 },
      fov: fov(80, 55, 38, 26, 50, 40, 60),
    },
    transitions: { within: "cut", between: "dissolve", sec: 0.6 },
    grade: { contrast: 0.35, saturation: 0.35, warmth: 0.25, grain: 0.1, vignette: 0.3 },
    audio: {
      musicMood: ["emotional", "dramatic", "melodic"],
      sfxDensity: "medium",
      voiceStyle: "dramatic and emotive",
      musicDuckDb: -12,
      targetLufs: -14,
    },
    subtitles: {
      fontFamily: FONT_STACK,
      sizeRatio: 0.05,
      position: "bottom",
      maxCharsPerLine: 36,
      maxLines: 2,
      readingWpm: 150,
    },
    sensitivity: { restrictDirectDepiction: false, symbolicTreatments: [], notes: "" },
  },

  anime: {
    id: "anime",
    version: 1,
    genre: "anime",
    tradition: null,
    visual: {
      styleHint:
        "anime style, cel shading, vibrant colors, expressive eyes, dynamic composition, detailed backgrounds",
      negativePrompt: "photorealistic, western cartoon, blurry, text, watermark",
      palette: ["#FF6B6B", "#4ECDC4", "#1A535C", "#FFE66D"],
      characterRendering: "cel_shaded",
    },
    shots: {
      avgShotSec: 3,
      minShotSec: 1.2,
      maxShotSec: 6,
      establishing: true,
      dialogueCoverage: "shot_reverse_shot",
      overShoulderRatio: 0.2,
      closeUpOnEmotion: true,
      shotWeights: { wide: 0.25, medium: 0.3, close_up: 0.25, extreme_close_up: 0.1, insert: 0.1 },
      motionWeights: { static: 0.2, slow_pan: 0.1, push_in: 0.3, pull_out: 0.05, handheld: 0.1, parallax: 0.2, orbit: 0.1 },
      fov: fov(90, 60, 40, 28, 55, 42, 65),
    },
    transitions: { within: "cut", between: "whip", sec: 0.25 },
    grade: { contrast: 0.3, saturation: 0.4, warmth: 0, grain: 0, vignette: 0.1 },
    audio: {
      musicMood: ["energetic", "emotional"],
      sfxDensity: "high",
      voiceStyle: "expressive and youthful",
      musicDuckDb: -13,
      targetLufs: -14,
    },
    subtitles: {
      fontFamily: FONT_STACK,
      sizeRatio: 0.05,
      position: "bottom",
      maxCharsPerLine: 34,
      maxLines: 2,
      readingWpm: 160,
    },
    sensitivity: { restrictDirectDepiction: false, symbolicTreatments: [], notes: "" },
  },

  cinematic: {
    id: "cinematic",
    version: 1,
    genre: "cinematic",
    tradition: null,
    visual: {
      styleHint:
        "cinematic realistic photography, natural lighting, shallow depth of field, film grain, muted color grade",
      negativePrompt: "cartoon, anime, oversaturated, text, watermark, deformed",
      palette: ["#1B263B", "#415A77", "#778DA9", "#E0E1DD"],
      characterRendering: "realistic",
    },
    shots: {
      avgShotSec: 5.5,
      minShotSec: 2.5,
      maxShotSec: 10,
      establishing: true,
      dialogueCoverage: "shot_reverse_shot",
      overShoulderRatio: 0.25,
      closeUpOnEmotion: true,
      shotWeights: { wide: 0.25, medium: 0.35, close_up: 0.2, extreme_close_up: 0.05, insert: 0.15 },
      motionWeights: { static: 0.3, slow_pan: 0.2, push_in: 0.2, pull_out: 0.1, handheld: 0.1, parallax: 0.05, orbit: 0.05 },
      fov: fov(75, 50, 32, 22, 45, 35, 55),
    },
    transitions: { within: "cut", between: "dissolve", sec: 0.8 },
    grade: { contrast: 0.25, saturation: -0.1, warmth: 0, grain: 0.25, vignette: 0.35 },
    audio: {
      musicMood: ["tense", "atmospheric", "orchestral"],
      sfxDensity: "medium",
      voiceStyle: "natural and restrained",
      musicDuckDb: -12,
      targetLufs: -14,
    },
    subtitles: {
      fontFamily: FONT_STACK,
      sizeRatio: 0.045,
      position: "bottom",
      maxCharsPerLine: 40,
      maxLines: 2,
      readingWpm: 150,
    },
    sensitivity: { restrictDirectDepiction: false, symbolicTreatments: [], notes: "" },
  },

  educational: {
    id: "educational",
    version: 1,
    genre: "educational",
    tradition: null,
    visual: {
      styleHint:
        "clean clear illustration, accurate and easy to understand, soft even lighting, simple backgrounds",
      negativePrompt: "cluttered, dark, distorted, text, watermark",
      palette: ["#2A9D8F", "#E9C46A", "#F4A261", "#264653"],
      characterRendering: "stylized_3d",
    },
    shots: {
      avgShotSec: 6,
      minShotSec: 3,
      maxShotSec: 12,
      establishing: false,
      dialogueCoverage: "single",
      overShoulderRatio: 0,
      closeUpOnEmotion: false,
      shotWeights: { wide: 0.2, medium: 0.4, close_up: 0.1, extreme_close_up: 0, insert: 0.3 },
      motionWeights: { static: 0.4, slow_pan: 0.2, push_in: 0.1, pull_out: 0.1, handheld: 0, parallax: 0.2, orbit: 0 },
      fov: fov(80, 60, 40, 30, 50, 45, 60),
    },
    transitions: { within: "cut", between: "dissolve", sec: 0.5 },
    grade: { contrast: 0.1, saturation: 0.1, warmth: 0.05, grain: 0, vignette: 0 },
    audio: {
      musicMood: ["calm", "curious"],
      sfxDensity: "low",
      voiceStyle: "clear and friendly narrator",
      musicDuckDb: -16,
      targetLufs: -14,
    },
    subtitles: {
      fontFamily: FONT_STACK,
      sizeRatio: 0.055,
      position: "bottom",
      maxCharsPerLine: 38,
      maxLines: 2,
      readingWpm: 150,
    },
    sensitivity: { restrictDirectDepiction: false, symbolicTreatments: [], notes: "" },
  },

  devotional: {
    id: "devotional",
    version: 1,
    genre: "devotional",
    tradition: null,
    visual: {
      styleHint:
        "serene devotional art, soft golden light, warm glowing colors, respectful traditional imagery, peaceful atmosphere",
      negativePrompt: "violent, dark, gritty, modern, irreverent, text, watermark",
      palette: ["#F4A300", "#FFD166", "#8D5524", "#FFF3D6"],
      characterRendering: "painterly",
    },
    shots: {
      avgShotSec: 7,
      minShotSec: 3,
      maxShotSec: 12,
      establishing: true,
      dialogueCoverage: "single",
      overShoulderRatio: 0,
      closeUpOnEmotion: false,
      shotWeights: { wide: 0.35, medium: 0.3, close_up: 0.1, extreme_close_up: 0, insert: 0.25 },
      motionWeights: { static: 0.2, slow_pan: 0.3, push_in: 0.2, pull_out: 0.15, handheld: 0, parallax: 0.15, orbit: 0 },
      fov: fov(80, 55, 38, 28, 50, 40, 60),
    },
    transitions: { within: "dissolve", between: "dissolve", sec: 1 },
    grade: { contrast: 0.05, saturation: 0.2, warmth: 0.4, grain: 0.05, vignette: 0.25 },
    audio: {
      musicMood: ["devotional", "soothing", "melodic"],
      sfxDensity: "low",
      voiceStyle: "warm, calm and reverent",
      musicDuckDb: -14,
      targetLufs: -14,
    },
    subtitles: {
      fontFamily: FONT_STACK,
      sizeRatio: 0.05,
      position: "bottom",
      maxCharsPerLine: 34,
      maxLines: 2,
      readingWpm: 140,
    },
    sensitivity: { restrictDirectDepiction: false, symbolicTreatments: [], notes: "" },
  },

  other: {
    id: "other",
    version: 1,
    genre: "other",
    tradition: null,
    visual: {
      styleHint: "polished illustrated storytelling, natural colors, clear composition, soft lighting",
      negativePrompt: "blurry, distorted, text, watermark",
      palette: ["#264653", "#2A9D8F", "#E9C46A", "#E76F51"],
      characterRendering: "stylized_3d",
    },
    shots: {
      avgShotSec: 4.5,
      minShotSec: 2,
      maxShotSec: 8,
      establishing: true,
      dialogueCoverage: "shot_reverse_shot",
      overShoulderRatio: 0.15,
      closeUpOnEmotion: true,
      shotWeights: { wide: 0.25, medium: 0.4, close_up: 0.2, extreme_close_up: 0.05, insert: 0.1 },
      motionWeights: { static: 0.25, slow_pan: 0.2, push_in: 0.2, pull_out: 0.1, handheld: 0.05, parallax: 0.15, orbit: 0.05 },
      fov: fov(85, 58, 38, 26, 52, 40, 60),
    },
    transitions: { within: "cut", between: "dissolve", sec: 0.5 },
    grade: { contrast: 0.15, saturation: 0.1, warmth: 0.05, grain: 0.05, vignette: 0.15 },
    audio: {
      musicMood: ["warm", "cinematic"],
      sfxDensity: "medium",
      voiceStyle: "natural and engaging",
      musicDuckDb: -13,
      targetLufs: -14,
    },
    subtitles: {
      fontFamily: FONT_STACK,
      sizeRatio: 0.05,
      position: "bottom",
      maxCharsPerLine: 36,
      maxLines: 2,
      readingWpm: 150,
    },
    sensitivity: { restrictDirectDepiction: false, symbolicTreatments: [], notes: "" },
  },
};

/**
 * Tradition overrides. The sensitivity section is applied to every genre.
 * The visual and audio sections shape the look and sound of devotional stories only.
 * Islam and Sikhism do not depict their central revered figures, so direct
 * depiction is restricted and symbolic treatment is used instead.
 */
export const TRADITION_OVERRIDES: Readonly<Record<Tradition, ProfileOverride>> = {
  hindu: {
    tradition: "hindu",
    sensitivity: {
      restrictDirectDepiction: false,
      symbolicTreatments: [],
      notes: "Show deities and sacred stories with traditional, respectful iconography.",
    },
    visual: {
      styleHint:
        "traditional Indian devotional art, soft golden light, diyas, marigold flowers, temple architecture, respectful imagery",
      palette: ["#E8590C", "#FFD43B", "#7B2D26", "#FFF3D6"],
    },
    audio: { musicMood: ["bhajan", "devotional", "melodic"] },
  },
  islam: {
    tradition: "islam",
    sensitivity: {
      restrictDirectDepiction: true,
      symbolicTreatments: ["light", "symbols", "voice_over"],
      notes: "Prophets and other revered figures are not depicted. Use light, calligraphy and voice instead.",
    },
    visual: {
      styleHint:
        "serene devotional art, geometric Islamic patterns, calligraphy motifs, domes and arches, soft light",
      palette: ["#0B6E4F", "#D4AF37", "#F5F1E3", "#1D3557"],
    },
    audio: { musicMood: ["calm", "soothing", "vocal"] },
  },
  sikh: {
    tradition: "sikh",
    sensitivity: {
      restrictDirectDepiction: true,
      symbolicTreatments: ["light", "symbols", "voice_over"],
      notes: "The Gurus are not depicted. Use light, sacred symbols and voice instead.",
    },
    visual: {
      styleHint:
        "serene devotional scenes, gurdwara architecture, golden light, saffron and blue colors, respectful imagery",
      palette: ["#F4A300", "#1D4E89", "#FFFFFF", "#7B3F00"],
    },
    audio: { musicMood: ["kirtan", "devotional", "soothing"] },
  },
  christian: {
    tradition: "christian",
    sensitivity: {
      restrictDirectDepiction: false,
      symbolicTreatments: [],
      notes: "Show sacred figures with dignity. Prefer reverent, traditional compositions.",
    },
    visual: {
      styleHint:
        "serene devotional art, church interiors, stained glass light, soft candlelight, respectful traditional imagery",
      palette: ["#274C77", "#E7C873", "#F8F4E3", "#6D597A"],
    },
    audio: { musicMood: ["hymn", "choral", "reverent"] },
  },
  buddhist: {
    tradition: "buddhist",
    sensitivity: {
      restrictDirectDepiction: false,
      symbolicTreatments: [],
      notes: "Show the Buddha and monks with calm dignity. Avoid casual or comic treatment.",
    },
    visual: {
      styleHint:
        "serene devotional art, quiet monastery, lotus flowers, soft mist, meditative atmosphere, respectful imagery",
      palette: ["#B7791F", "#7C2D12", "#FDE68A", "#365314"],
    },
    audio: { musicMood: ["meditative", "ambient", "bells"] },
  },
  jain: {
    tradition: "jain",
    sensitivity: {
      restrictDirectDepiction: false,
      symbolicTreatments: [],
      notes: "Show the Tirthankaras with calm dignity and avoid any depiction of violence.",
    },
    visual: {
      styleHint:
        "serene devotional art, white marble temples, lotus flowers, minimal peaceful scenes, respectful imagery",
      palette: ["#F8F9FA", "#C0A062", "#2B6777", "#E4572E"],
    },
    audio: { musicMood: ["calm", "chant-like", "meditative"] },
  },
};

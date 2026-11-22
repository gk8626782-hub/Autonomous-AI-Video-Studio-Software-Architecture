import { DEFAULT_WORDS_PER_MINUTE, normalizeName } from "@avs/story";
import type { GenreProfile, ShotType, SymbolicKind } from "@avs/genre";
import { estimateSpeechMs, parseBeats } from "./beats";
import type { Beat } from "./beats";
import { baseYawFor, circularMeanDeg, normalizeDeg, pickMotion, round1, stageYaw } from "./camera";
import { shotIdFor } from "./ids";
import { createRng, pickWeighted } from "./random";
import type {
  DirectorCharacter,
  DirectorEnvironment,
  DirectorInput,
  DirectorPlan,
  DirectorScene,
  PlannedLine,
  PlannedScene,
  PlannedShot,
} from "./types";

interface Prepared {
  readonly scene: DirectorScene;
  readonly env: DirectorEnvironment | null;
  /** Key used for stage positions: the environment id, or "none". */
  readonly envKey: string;
  readonly cast: readonly DirectorCharacter[];
  readonly beats: readonly Beat[];
}

interface Unit {
  readonly beat: Beat;
  readonly character: DirectorCharacter | null;
  readonly durationMs: number;
}

interface Group {
  units: Unit[];
  durationMs: number;
}

interface Draft {
  type: ShotType;
  treatment: "direct" | "symbolic";
  symbol: SymbolicKind | null;
  characters: DirectorCharacter[];
  lines: PlannedLine[];
  durationMs: number;
  yaw: number;
  pitch: number;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** How many words fit in about one average shot. Beats are cut to this size so shots follow the profile's pace. */
function beatWordLimit(profile: GenreProfile, input: DirectorInput): number {
  const wordsPerMinute = DEFAULT_WORDS_PER_MINUTE[input.language];
  return Math.max(6, Math.round(((profile.shots.avgShotSec * wordsPerMinute) / 60) * 1.2));
}

function matchEnvironment(
  location: string,
  environments: readonly DirectorEnvironment[],
): DirectorEnvironment | null {
  const wanted = normalizeName(location);
  if (wanted === "") {
    return null;
  }
  const exact = environments.find((environment) => normalizeName(environment.name) === wanted);
  if (exact !== undefined) {
    return exact;
  }
  return (
    environments.find((environment) => {
      const name = normalizeName(environment.name);
      return name !== "" && (name.includes(wanted) || wanted.includes(name));
    }) ?? null
  );
}

function prepareScene(
  scene: DirectorScene,
  input: DirectorInput,
  byName: ReadonlyMap<string, DirectorCharacter>,
  names: readonly string[],
  maxWords: number,
  warnings: Set<string>,
): Prepared {
  const beats = parseBeats(scene.text, names, maxWords);

  const cast = new Map<string, DirectorCharacter>();
  for (const name of scene.characters) {
    const character = byName.get(normalizeName(name));
    if (character === undefined) {
      warnings.add(`unknown_character:${name}`);
    } else {
      cast.set(character.id, character);
    }
  }
  for (const beat of beats) {
    if (beat.speakerName !== null) {
      const speaker = byName.get(normalizeName(beat.speakerName));
      if (speaker !== undefined) {
        cast.set(speaker.id, speaker);
      }
    }
  }

  const env = matchEnvironment(scene.location, input.environments);
  if (env === null && scene.location.trim() !== "") {
    warnings.add(`no_environment:${scene.location}`);
  }

  return { scene, env, envKey: env?.id ?? "none", cast: [...cast.values()], beats };
}

function speakerKey(unit: Unit): string {
  return unit.character === null ? "" : unit.character.id;
}

/**
 * Joins neighbouring beats into one shot while the shot stays close to the
 * profile's average length. Only the same speaker (or, for two-shot coverage,
 * two speakers) share a shot.
 */
function groupUnits(units: readonly Unit[], profile: GenreProfile, avgMs: number, maxMs: number): Group[] {
  const limit = Math.min(maxMs, Math.round(avgMs * 1.15));
  const groups: Group[] = [];
  let current: Group | undefined;

  for (const unit of units) {
    const last = current?.units[current.units.length - 1];
    const fits = current !== undefined && current.durationMs + unit.durationMs <= limit;
    const sameSpeaker = last !== undefined && speakerKey(last) === speakerKey(unit);
    const twoShot =
      last !== undefined &&
      profile.shots.dialogueCoverage === "two_shot" &&
      speakerKey(last) !== "" &&
      speakerKey(unit) !== "";

    if (current !== undefined && fits && (sameSpeaker || twoShot)) {
      current.units.push(unit);
      current.durationMs += unit.durationMs;
    } else {
      current = { units: [unit], durationMs: unit.durationMs };
      groups.push(current);
    }
  }
  return groups;
}

function uniqueSpeakers(group: Group): DirectorCharacter[] {
  const seen = new Map<string, DirectorCharacter>();
  for (const unit of group.units) {
    if (unit.character !== null) {
      seen.set(unit.character.id, unit.character);
    }
  }
  return [...seen.values()];
}

/** Adds the missing time to the shots in proportion to their length, so the scene lasts exactly as planned. */
function stretchDurations(drafts: Draft[], targetMs: number): Draft[] {
  const natural = drafts.reduce((sum, draft) => sum + draft.durationMs, 0);
  if (natural <= 0 || natural >= targetMs) {
    return drafts;
  }

  const extra = targetMs - natural;
  let assigned = 0;
  return drafts.map((draft, index) => {
    const add =
      index === drafts.length - 1 ? extra - assigned : Math.round((extra * draft.durationMs) / natural);
    assigned += add;
    return { ...draft, durationMs: draft.durationMs + add };
  });
}

const SHOT_WORDS: Readonly<Record<ShotType, string>> = {
  wide: "wide establishing shot",
  medium: "medium shot",
  close_up: "close-up shot",
  extreme_close_up: "extreme close-up shot",
  over_shoulder: "over-the-shoulder shot",
  insert: "detail insert shot",
  symbolic: "symbolic shot",
};

const SYMBOL_WORDS: Readonly<Record<SymbolicKind, string>> = {
  light: "soft radiant light",
  symbols: "traditional sacred symbols",
  hands: "folded hands and offerings",
  voice_over: "a serene empty scene while a voice is heard",
};

function buildShotPrompt(
  draft: Draft,
  environment: DirectorEnvironment | null,
  summary: string,
  profile: GenreProfile,
): string {
  const who = draft.characters
    .map((character) =>
      character.appearance === undefined || character.appearance === ""
        ? character.name
        : `${character.name} (${character.appearance})`,
    )
    .join(", ");

  return [
    SHOT_WORDS[draft.type],
    who === "" ? "" : `of ${who}`,
    environment === null ? "" : `in ${environment.name}`,
    summary === "" ? "" : `${summary.replace(/[.\s]+$/, "")}.`,
    draft.treatment === "symbolic" && draft.symbol !== null
      ? `Shown symbolically through ${SYMBOL_WORDS[draft.symbol]}, without depicting any person.`
      : "",
    `Style: ${profile.visual.styleHint}.`,
  ]
    .filter((part) => part !== "")
    .join(" ");
}

function toLine(unit: Unit): PlannedLine {
  return {
    kind: unit.beat.kind,
    speakerId: unit.character?.id ?? null,
    speakerName: unit.character?.name ?? null,
    text: unit.beat.text,
    durationMs: unit.durationMs,
  };
}

function buildScene(
  item: Prepared,
  input: DirectorInput,
  rankOf: (envKey: string, characterId: string) => number,
  warnings: Set<string>,
): PlannedScene {
  const { profile, language, projectId } = input;
  const { scene, env, envKey, cast, beats } = item;
  const rng = createRng(`${projectId}:scene:${scene.index}`);

  const minMs = Math.round(profile.shots.minShotSec * 1000);
  const avgMs = Math.round(profile.shots.avgShotSec * 1000);
  const maxMs = Math.round(profile.shots.maxShotSec * 1000);
  const targetMs = Math.round(scene.targetSec * 1000);
  const restrictOn = profile.sensitivity.restrictDirectDepiction;
  const baseYaw = baseYawFor(envKey);

  const stage = (character: DirectorCharacter): number => stageYaw(envKey, rankOf(envKey, character.id));
  const isHidden = (character: DirectorCharacter): boolean => restrictOn && character.restricted === true;
  const visibleCast = cast.filter((character) => !isHidden(character));
  const w = profile.shots.shotWeights;

  const draftFor = (group: Group): Draft => {
    const speakers = uniqueSpeakers(group);
    const hidden = speakers.filter(isHidden);
    const visible = speakers.filter((character) => !isHidden(character));
    const lines = group.units.map(toLine);
    const durationMs = Math.max(minMs, group.durationMs);

    if (hidden.length > 0) {
      for (const character of hidden) {
        warnings.add(`restricted_depiction:${character.name}`);
      }
      const kinds = profile.sensitivity.symbolicTreatments;
      return {
        type: "symbolic",
        treatment: "symbolic",
        symbol: kinds[Math.floor(rng() * kinds.length)] ?? null,
        characters: visible,
        lines,
        durationMs,
        yaw: round1(normalizeDeg(baseYaw + rng() * 120 - 60)),
        pitch: 8,
      };
    }

    const lastText = group.units[group.units.length - 1]?.beat.text ?? "";
    const emotional = profile.shots.closeUpOnEmotion && /[!?]["”’)]*\s*$/.test(lastText);
    const primary = visible[0];
    const lead = visibleCast[0];

    let type: ShotType;
    let characters: DirectorCharacter[];

    if (speakers.length === 0) {
      type = pickWeighted({ wide: w.wide, medium: w.medium, insert: w.insert }, rng);
      characters = type === "wide" ? [...visibleCast] : type === "medium" && lead !== undefined ? [lead] : [];
    } else if (profile.shots.dialogueCoverage === "two_shot" && visible.length >= 2) {
      type = "medium";
      characters = visible;
    } else if (
      profile.shots.dialogueCoverage === "shot_reverse_shot" &&
      visibleCast.length >= 2 &&
      primary !== undefined &&
      rng() < profile.shots.overShoulderRatio
    ) {
      const other = visibleCast.find((character) => character.id !== primary.id);
      type = other === undefined ? "medium" : "over_shoulder";
      characters = other === undefined ? [primary] : [primary, other];
    } else {
      const weights = { medium: w.medium, close_up: w.close_up, extreme_close_up: w.extreme_close_up };
      if (emotional) {
        weights.medium *= 0.4;
        weights.close_up *= 2.5;
        weights.extreme_close_up *= 2.5;
      }
      if (profile.shots.dialogueCoverage === "single") {
        weights.close_up *= 0.3;
        weights.extreme_close_up = 0;
      }
      type = pickWeighted(weights, rng);
      characters = visible;
    }

    let yaw: number;
    switch (type) {
      case "wide":
      case "medium":
      case "close_up":
      case "extreme_close_up":
        yaw = characters.length > 0 ? circularMeanDeg(characters.map(stage)) : baseYaw;
        break;
      case "over_shoulder": {
        const target = characters[1];
        yaw = target === undefined ? baseYaw : normalizeDeg(stage(target) + 12);
        break;
      }
      default:
        yaw = normalizeDeg(baseYaw + rng() * 120 - 60);
    }

    const pitch =
      type === "close_up" || type === "extreme_close_up" ? rng() * 4 - 2 : type === "insert" ? rng() * 10 - 5 : 0;

    return {
      type,
      treatment: "direct",
      symbol: null,
      characters,
      lines,
      durationMs,
      yaw: round1(yaw),
      pitch: round1(pitch),
    };
  };

  const drafts: Draft[] = [];

  if (profile.shots.establishing || beats.length === 0) {
    drafts.push({
      type: "wide",
      treatment: "direct",
      symbol: null,
      characters: [],
      lines: [],
      durationMs: beats.length === 0 ? Math.max(targetMs, minMs) : clamp(avgMs, minMs, maxMs),
      yaw: round1(baseYaw),
      pitch: 2,
    });
  }

  const units: Unit[] = beats.map((beat) => ({
    beat,
    character:
      beat.speakerName === null
        ? null
        : (input.characters.find((c) => normalizeName(c.name) === normalizeName(beat.speakerName ?? "")) ?? null),
    durationMs: estimateSpeechMs(beat.text, language),
  }));
  for (const group of groupUnits(units, profile, avgMs, maxMs)) {
    drafts.push(draftFor(group));
  }

  const natural = drafts.reduce((sum, draft) => sum + draft.durationMs, 0);
  if (natural > targetMs * 1.15) {
    warnings.add(`scene_overrun:${scene.index}`);
  }

  const shots: PlannedShot[] = stretchDurations(drafts, targetMs).map((draft, index, all) => {
    if (draft.durationMs > maxMs * 2) {
      warnings.add(`long_hold:${scene.index}`);
    }
    return {
      id: shotIdFor(projectId, scene.index, index),
      sceneIndex: scene.index,
      index,
      shotType: draft.type,
      treatment: draft.treatment,
      symbol: draft.symbol,
      motion: pickMotion(profile, draft.type, draft.durationMs, rng),
      yaw: draft.yaw,
      pitch: draft.pitch,
      fov: profile.shots.fov[draft.type],
      durationMs: draft.durationMs,
      characterIds: draft.characters.map((character) => character.id),
      lines: draft.lines,
      transitionOut: index === all.length - 1 ? profile.transitions.between : profile.transitions.within,
      prompt: buildShotPrompt(draft, env, scene.summary, profile),
    };
  });

  return {
    index: scene.index,
    title: scene.title,
    summary: scene.summary,
    targetSec: scene.targetSec,
    environmentId: env?.id ?? null,
    characterIds: cast.map((character) => character.id),
    baseYaw: round1(baseYaw),
    shots,
  };
}

/**
 * Plans the shots of every scene from the written text and the genre profile.
 * The result is deterministic: the same input always gives the same plan.
 */
export function planDirector(input: DirectorInput): DirectorPlan {
  const warnings = new Set<string>();
  const byName = new Map(input.characters.map((character) => [normalizeName(character.name), character] as const));
  const names = input.characters.map((character) => character.name);
  const maxWords = beatWordLimit(input.profile, input);

  const prepared = input.scenes.map((scene) => prepareScene(scene, input, byName, names, maxWords, warnings));

  // Characters in the same place keep the same position in every scene that uses it.
  const castByEnv = new Map<string, Set<string>>();
  for (const item of prepared) {
    const ids = castByEnv.get(item.envKey) ?? new Set<string>();
    for (const character of item.cast) {
      ids.add(character.id);
    }
    castByEnv.set(item.envKey, ids);
  }
  const rankOf = (envKey: string, characterId: string): number => {
    const ids = [...(castByEnv.get(envKey) ?? [])].sort();
    return Math.max(0, ids.indexOf(characterId));
  };

  const scenes = prepared.map((item) => buildScene(item, input, rankOf, warnings));

  const lastScene = scenes[scenes.length - 1];
  const lastShot = lastScene?.shots[lastScene.shots.length - 1];
  if (lastScene !== undefined && lastShot !== undefined) {
    lastScene.shots[lastScene.shots.length - 1] = { ...lastShot, transitionOut: "fade" };
  }

  return {
    projectId: input.projectId,
    profileId: input.profile.id,
    scenes,
    totalMs: scenes.reduce(
      (total, scene) => total + scene.shots.reduce((sum, shot) => sum + shot.durationMs, 0),
      0,
    ),
    warnings: [...warnings].sort(),
    negativePrompt: input.profile.visual.negativePrompt,
  };
}

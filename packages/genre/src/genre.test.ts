import { describe, expect, it } from "vitest";
import { GENRES, TRADITIONS } from "@avs/story";
import { BASE_PROFILES, TRADITION_OVERRIDES } from "./profiles";
import {
  listProfileIds,
  mergeProfile,
  parseProfileId,
  profileIdFor,
  resolveProfile,
  subtitleScriptFor,
} from "./resolve";
import { overrideSchema, profileSchema } from "./schema";

describe("built-in profiles", () => {
  it.each(GENRES)("%s passes the schema and has matching id and genre", (genre) => {
    const profile = BASE_PROFILES[genre];
    expect(profileSchema.safeParse(profile).success).toBe(true);
    expect(profile.id).toBe(genre);
    expect(profile.genre).toBe(genre);
    expect(profile.tradition).toBeNull();
  });

  it.each(TRADITIONS)("%s override passes the override schema", (tradition) => {
    expect(overrideSchema.safeParse(TRADITION_OVERRIDES[tradition]).success).toBe(true);
  });

  it("makes genres feel different: faster cuts for cartoons, slower for devotional", () => {
    const cartoon = BASE_PROFILES.cartoon.shots.avgShotSec;
    const cinematic = BASE_PROFILES.cinematic.shots.avgShotSec;
    const devotional = BASE_PROFILES.devotional.shots.avgShotSec;
    expect(cartoon).toBeLessThan(cinematic);
    expect(cinematic).toBeLessThan(devotional);
  });
});

describe("profile ids", () => {
  it("round-trips ids", () => {
    expect(profileIdFor({ genre: "cartoon", tradition: null })).toBe("cartoon");
    expect(profileIdFor({ genre: "devotional", tradition: "sikh" })).toBe("devotional:sikh");
    expect(parseProfileId("cartoon")).toEqual({ genre: "cartoon", tradition: null });
    expect(parseProfileId("devotional:sikh")).toEqual({ genre: "devotional", tradition: "sikh" });
  });

  it("rejects unknown or malformed ids", () => {
    expect(parseProfileId("")).toBeNull();
    expect(parseProfileId("western")).toBeNull();
    expect(parseProfileId("devotional:martian")).toBeNull();
    expect(parseProfileId("devotional:sikh:extra")).toBeNull();
  });

  it("lists every genre and every devotional tradition", () => {
    const ids = listProfileIds();
    expect(ids).toHaveLength(GENRES.length + TRADITIONS.length);
    expect(ids).toContain("anime");
    expect(ids).toContain("devotional:jain");
  });
});

describe("resolveProfile", () => {
  it("resolves every genre with and without every tradition into a valid profile", () => {
    for (const genre of GENRES) {
      for (const tradition of [null, ...TRADITIONS]) {
        const profile = resolveProfile({ genre, tradition });
        expect(profileSchema.safeParse(profile).success).toBe(true);
        expect(profile.id).toBe(profileIdFor({ genre, tradition }));
        expect(profile.tradition).toBe(tradition);
      }
    }
  });

  it("restricts direct depiction for Islam and Sikhism, in every genre", () => {
    for (const tradition of ["islam", "sikh"] as const) {
      for (const genre of ["devotional", "cartoon", "cinematic"] as const) {
        const { sensitivity } = resolveProfile({ genre, tradition });
        expect(sensitivity.restrictDirectDepiction).toBe(true);
        expect(sensitivity.symbolicTreatments.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not restrict depiction for other traditions or for plain genres", () => {
    for (const tradition of ["hindu", "christian", "buddhist", "jain"] as const) {
      expect(resolveProfile({ genre: "devotional", tradition }).sensitivity.restrictDirectDepiction).toBe(false);
    }
    expect(resolveProfile({ genre: "cartoon", tradition: null }).sensitivity.restrictDirectDepiction).toBe(false);
  });

  it("changes only the sensitivity rules when a tradition is combined with another genre", () => {
    const plain = resolveProfile({ genre: "cartoon", tradition: null });
    const withTradition = resolveProfile({ genre: "cartoon", tradition: "islam" });

    expect(withTradition.visual).toEqual(plain.visual);
    expect(withTradition.audio).toEqual(plain.audio);
    expect(withTradition.shots).toEqual(plain.shots);
    expect(withTradition.sensitivity).not.toEqual(plain.sensitivity);
  });

  it("changes the look and sound of devotional stories by tradition", () => {
    const base = resolveProfile({ genre: "devotional", tradition: null });
    const hindu = resolveProfile({ genre: "devotional", tradition: "hindu" });
    const buddhist = resolveProfile({ genre: "devotional", tradition: "buddhist" });

    expect(hindu.visual.styleHint).not.toBe(base.visual.styleHint);
    expect(hindu.audio.musicMood).toEqual(["bhajan", "devotional", "melodic"]);
    expect(buddhist.audio.musicMood).toContain("meditative");
    expect(hindu.shots).toEqual(base.shots);
  });
});

describe("mergeProfile", () => {
  const base = BASE_PROFILES.cartoon;

  it("merges nested objects and replaces arrays", () => {
    const merged = mergeProfile(base, {
      shots: { avgShotSec: 4 },
      audio: { musicMood: ["quiet"] },
    });

    expect(merged.shots.avgShotSec).toBe(4);
    expect(merged.shots.minShotSec).toBe(base.shots.minShotSec);
    expect(merged.shots.fov).toEqual(base.shots.fov);
    expect(merged.audio.musicMood).toEqual(["quiet"]);
    expect(merged.audio.voiceStyle).toBe(base.audio.voiceStyle);
  });

  it("does not change the base profile", () => {
    mergeProfile(base, { shots: { avgShotSec: 4 } });
    expect(base.shots.avgShotSec).toBe(3.5);
  });

  it("rejects a merge that makes the profile invalid", () => {
    expect(() => mergeProfile(base, { shots: { minShotSec: 20 } })).toThrowError();
    expect(() =>
      mergeProfile(base, { sensitivity: { restrictDirectDepiction: true, symbolicTreatments: [] } }),
    ).toThrowError();
  });
});

describe("schema rules", () => {
  it("rejects bad palette colors, shot weights that are all zero and bad shot lengths", () => {
    const base = BASE_PROFILES.cinematic;

    expect(profileSchema.safeParse({ ...base, visual: { ...base.visual, palette: ["red"] } }).success).toBe(false);
    expect(
      profileSchema.safeParse({
        ...base,
        shots: { ...base.shots, shotWeights: { wide: 0, medium: 0, close_up: 0, extreme_close_up: 0, insert: 0 } },
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...base, shots: { ...base.shots, minShotSec: 9, avgShotSec: 5.5, maxShotSec: 10 } }).success,
    ).toBe(false);
  });
});

describe("subtitleScriptFor", () => {
  it("picks the script from the story language", () => {
    expect(subtitleScriptFor("hi")).toBe("devanagari");
    expect(subtitleScriptFor("en")).toBe("latin");
    expect(subtitleScriptFor("hinglish")).toBe("mixed");
  });
});

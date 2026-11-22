import { describe, expect, it } from "vitest";
import { resolveProfile } from "@avs/genre";
import type { GenreProfile } from "@avs/genre";
import { parseBeats } from "./beats";
import { normalizeDeg } from "./camera";
import { planDirector } from "./plan";
import type { DirectorCharacter, DirectorInput, DirectorScene, PlannedShot } from "./types";

const characters: DirectorCharacter[] = [
  { id: "c-asha", name: "Asha", appearance: "red scarf" },
  { id: "c-ravi", name: "Ravi" },
];
const environments = [{ id: "e-village", name: "Village" }];

const DIALOGUE_TEXT = [
  "Asha: Where is my lamp?",
  "Ravi: It is under the old tree.",
  "The sun rose slowly over the village.",
  "Asha: Thank you, my friend!",
].join("\n");

const LONG_TEXT = Array.from(
  { length: 25 },
  (_unused, i) => `The quiet river number ${i} carried the little boat toward the hills.`,
).join(" ");

const scene = (overrides: Partial<DirectorScene> = {}): DirectorScene => ({
  index: 0,
  title: "The lamp",
  summary: "Asha looks for her lamp",
  targetSec: 40,
  location: "Village",
  characters: ["Asha", "Ravi"],
  text: DIALOGUE_TEXT,
  ...overrides,
});

const cartoon = resolveProfile({ genre: "cartoon", tradition: null });
const cinematic = resolveProfile({ genre: "cinematic", tradition: null });

function input(overrides: Partial<DirectorInput> = {}): DirectorInput {
  return {
    projectId: "p1",
    language: "en",
    profile: cartoon,
    scenes: [scene()],
    characters,
    environments,
    ...overrides,
  };
}

const sumMs = (shots: readonly PlannedShot[]): number => shots.reduce((total, shot) => total + shot.durationMs, 0);

describe("planDirector", () => {
  it("opens with a wide establishing shot of the place and covers every spoken line", () => {
    const plan = planDirector(input());
    const shots = plan.scenes[0]?.shots ?? [];
    const first = shots[0];

    expect(first).toMatchObject({ shotType: "wide", characterIds: [], lines: [], treatment: "direct" });
    expect(plan.scenes[0]?.environmentId).toBe("e-village");

    const planned = shots.flatMap((shot) => shot.lines.map((line) => line.text));
    const expected = parseBeats(DIALOGUE_TEXT, ["Asha", "Ravi"], 10).map((beat) => beat.text);
    expect(planned).toEqual(expected);
  });

  it("links dialogue lines to the board characters", () => {
    const plan = planDirector(input());
    const lines = (plan.scenes[0]?.shots ?? []).flatMap((shot) => shot.lines);

    expect(lines.filter((line) => line.speakerId === "c-asha")).toHaveLength(2);
    expect(lines.filter((line) => line.speakerId === "c-ravi")).toHaveLength(1);
    expect(lines.filter((line) => line.kind === "narration").every((line) => line.speakerId === null)).toBe(true);
    expect(plan.scenes[0]?.characterIds.sort()).toEqual(["c-asha", "c-ravi"]);
  });

  it("makes the scene last exactly as long as planned when the text is shorter", () => {
    const plan = planDirector(input());
    expect(sumMs(plan.scenes[0]?.shots ?? [])).toBe(40_000);
    expect(plan.totalMs).toBe(40_000);
  });

  it("keeps the natural length and warns when the text is too long for the scene", () => {
    const plan = planDirector(input({ scenes: [scene({ targetSec: 5, text: LONG_TEXT })] }));

    expect(plan.warnings).toContain("scene_overrun:0");
    expect(sumMs(plan.scenes[0]?.shots ?? [])).toBeGreaterThan(5000);
  });

  it("gives a scene without text one wide shot for its whole length", () => {
    const plan = planDirector(input({ scenes: [scene({ text: "" })] }));
    const shots = plan.scenes[0]?.shots ?? [];

    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ shotType: "wide", durationMs: 40_000 });
  });

  it("is deterministic", () => {
    expect(planDirector(input())).toEqual(planDirector(input()));
  });

  it("gives different plans for different genres: more, shorter shots for a cartoon", () => {
    const long = scene({ targetSec: 200, text: LONG_TEXT });
    const cartoonPlan = planDirector(input({ profile: cartoon, scenes: [long] }));
    const cinematicPlan = planDirector(input({ profile: cinematic, scenes: [long] }));

    const cartoonShots = cartoonPlan.scenes[0]?.shots ?? [];
    const cinematicShots = cinematicPlan.scenes[0]?.shots ?? [];

    expect(cartoonShots.length).toBeGreaterThan(cinematicShots.length);
    expect(sumMs(cartoonShots) / cartoonShots.length).toBeLessThan(sumMs(cinematicShots) / cinematicShots.length);
    expect(cartoonPlan.profileId).toBe("cartoon");
    expect(cinematicPlan.negativePrompt).toBe(cinematic.visual.negativePrompt);
  });

  it("puts a character at the same place on stage in every shot", () => {
    const plan = planDirector(input({ scenes: [scene({ text: LONG_DIALOGUE() })] }));
    const yawsBySpeaker = new Map<string, Set<number>>();

    for (const shot of plan.scenes[0]?.shots ?? []) {
      const speaker = shot.lines[0]?.speakerId;
      const single = shot.characterIds.length === 1 && ["medium", "close_up", "extreme_close_up"].includes(shot.shotType);
      if (speaker != null && single) {
        const yaws = yawsBySpeaker.get(speaker) ?? new Set<number>();
        yaws.add(shot.yaw);
        yawsBySpeaker.set(speaker, yaws);
      }
    }

    const asha = [...(yawsBySpeaker.get("c-asha") ?? [])];
    const ravi = [...(yawsBySpeaker.get("c-ravi") ?? [])];
    expect(asha).toHaveLength(1);
    expect(ravi).toHaveLength(1);
    expect(normalizeDeg((ravi[0] ?? 0) - (asha[0] ?? 0))).toBe(45);
  });

  it("uses the profile's field of view and builds a prompt with style, place and characters", () => {
    const plan = planDirector(input());
    const shots = plan.scenes[0]?.shots ?? [];

    for (const shot of shots) {
      expect(shot.fov).toBe(cartoon.shots.fov[shot.shotType]);
    }
    expect(shots[0]?.prompt).toContain("wide establishing shot");
    expect(shots[0]?.prompt).toContain("in Village");
    expect(shots[0]?.prompt).toContain(cartoon.visual.styleHint);
    expect(shots.some((shot) => shot.prompt.includes("Asha (red scarf)"))).toBe(true);
  });

  it("numbers shots in order with stable ids and sets the transitions", () => {
    const plan = planDirector(input({ scenes: [scene({ index: 0 }), scene({ index: 1, text: "A quiet night." })] }));
    const first = plan.scenes[0]?.shots ?? [];
    const second = plan.scenes[1]?.shots ?? [];

    expect(first.map((shot) => shot.index)).toEqual(first.map((_shot, i) => i));
    expect(first[0]?.id).toBe("shot:p1:0:0");
    expect(first[first.length - 1]?.transitionOut).toBe(cartoon.transitions.between);
    expect(first[0]?.transitionOut).toBe(cartoon.transitions.within);
    expect(second[second.length - 1]?.transitionOut).toBe("fade");
  });

  it("warns about unknown characters and places", () => {
    const plan = planDirector(
      input({ scenes: [scene({ location: "Moon", characters: ["Asha", "Ghost"] })] }),
    );

    expect(plan.warnings).toContain("no_environment:Moon");
    expect(plan.warnings).toContain("unknown_character:Ghost");
    expect(plan.scenes[0]?.environmentId).toBeNull();
  });

  describe("restricted figures", () => {
    const restrictedCast: DirectorCharacter[] = [
      { id: "c-asha", name: "Asha" },
      { id: "c-ravi", name: "Ravi", restricted: true },
    ];
    const restrictedText = [
      "Asha: Peace be with you.",
      "Ravi: And peace be with you.",
      "Ravi: Let us walk together.",
      "Asha: Yes, let us go.",
    ].join("\n");

    it("shows them symbolically when the profile restricts depiction", () => {
      const islamic = resolveProfile({ genre: "cartoon", tradition: "islam" });
      const plan = planDirector(
        input({ profile: islamic, characters: restrictedCast, scenes: [scene({ text: restrictedText })] }),
      );
      const raviShots = (plan.scenes[0]?.shots ?? []).filter((shot) =>
        shot.lines.some((line) => line.speakerId === "c-ravi"),
      );

      expect(raviShots.length).toBeGreaterThan(0);
      for (const shot of raviShots) {
        expect(shot).toMatchObject({ shotType: "symbolic", treatment: "symbolic" });
        expect(islamic.sensitivity.symbolicTreatments).toContain(shot.symbol);
        expect(shot.characterIds).not.toContain("c-ravi");
        expect(shot.prompt).toContain("without depicting any person");
      }
      expect(plan.warnings).toContain("restricted_depiction:Ravi");
    });

    it("never frames a restricted figure in any other shot", () => {
      const islamic = resolveProfile({ genre: "cartoon", tradition: "islam" });
      const plan = planDirector(
        input({ profile: islamic, characters: restrictedCast, scenes: [scene({ text: restrictedText })] }),
      );

      for (const shot of plan.scenes[0]?.shots ?? []) {
        expect(shot.characterIds).not.toContain("c-ravi");
      }
    });

    it("shows them normally when the profile does not restrict depiction", () => {
      const plan = planDirector(
        input({ profile: cartoon, characters: restrictedCast, scenes: [scene({ text: restrictedText })] }),
      );
      const raviShots = (plan.scenes[0]?.shots ?? []).filter((shot) =>
        shot.lines.some((line) => line.speakerId === "c-ravi"),
      );

      expect(raviShots.every((shot) => shot.treatment === "direct" && shot.characterIds.includes("c-ravi"))).toBe(true);
      expect(plan.warnings.some((warning) => warning.startsWith("restricted_depiction"))).toBe(false);
    });
  });
});

/** Many alternating dialogue lines, so both characters get several shots. */
function LONG_DIALOGUE(): string {
  const lines: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    lines.push(`Asha: This is line number ${i} from Asha.`);
    lines.push(`Ravi: This is line number ${i} from Ravi.`);
  }
  return lines.join("\n");
}

describe("profile type", () => {
  it("accepts any resolved profile as input", () => {
    const profile: GenreProfile = resolveProfile({ genre: "devotional", tradition: "hindu" });
    expect(planDirector(input({ profile })).profileId).toBe("devotional:hindu");
  });
});

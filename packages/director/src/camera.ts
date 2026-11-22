import { CAMERA_MOTIONS } from "@avs/genre";
import type { CameraMotion, GenreProfile, ShotType } from "@avs/genre";
import { hashString, pickWeighted } from "./random";

/** Characters in the same place stand this many degrees apart around the panorama. */
export const STAGE_SPACING_DEG = 45;

export function normalizeDeg(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Average of angles on a circle, so 350 and 10 give 0 and not 180. */
export function circularMeanDeg(angles: readonly number[]): number {
  if (angles.length === 0) {
    return 0;
  }
  let x = 0;
  let y = 0;
  for (const angle of angles) {
    const radians = (angle * Math.PI) / 180;
    x += Math.cos(radians);
    y += Math.sin(radians);
  }
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/** The direction of the middle of a place. Stable for a given environment. */
export function baseYawFor(envKey: string): number {
  return hashString(envKey) % 360;
}

/** Where a character stands in a place. Rank 0, 1, 2... places characters 45 degrees apart. */
export function stageYaw(envKey: string, rank: number): number {
  return normalizeDeg(baseYawFor(envKey) + rank * STAGE_SPACING_DEG);
}

/** How well each camera move suits each kind of shot. Multiplies the profile's own weights. */
const MOTION_FIT: Readonly<Record<ShotType, Readonly<Record<CameraMotion, number>>>> = {
  wide: { static: 1, slow_pan: 1.5, push_in: 0.6, pull_out: 1.2, handheld: 0.3, parallax: 1.5, orbit: 1 },
  medium: { static: 1, slow_pan: 0.8, push_in: 1.2, pull_out: 0.8, handheld: 1, parallax: 0.8, orbit: 0.8 },
  close_up: { static: 1.2, slow_pan: 0.2, push_in: 1.5, pull_out: 0.4, handheld: 1, parallax: 0.2, orbit: 0.3 },
  extreme_close_up: { static: 1.5, slow_pan: 0, push_in: 1.2, pull_out: 0, handheld: 0.8, parallax: 0, orbit: 0 },
  over_shoulder: { static: 1.3, slow_pan: 0.3, push_in: 1, pull_out: 0.4, handheld: 1, parallax: 0.2, orbit: 0.2 },
  insert: { static: 1, slow_pan: 1, push_in: 1, pull_out: 0.5, handheld: 0.6, parallax: 0.8, orbit: 1 },
  symbolic: { static: 0.5, slow_pan: 1.5, push_in: 1, pull_out: 1, handheld: 0, parallax: 0.5, orbit: 0.5 },
};

/** Very short shots stay still, because a camera move needs time to be seen. */
export function pickMotion(
  profile: GenreProfile,
  shotType: ShotType,
  durationMs: number,
  rng: () => number,
): CameraMotion {
  if (durationMs < 2000) {
    return "static";
  }
  const fit = MOTION_FIT[shotType];
  const weights = {} as Record<CameraMotion, number>;
  for (const motion of CAMERA_MOTIONS) {
    weights[motion] = profile.shots.motionWeights[motion] * fit[motion];
  }
  return pickWeighted(weights, rng);
}

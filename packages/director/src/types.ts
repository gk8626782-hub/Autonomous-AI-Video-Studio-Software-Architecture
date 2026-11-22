import type { CameraMotion, GenreProfile, ShotType, SymbolicKind, Transition } from "@avs/genre";
import type { StoryLanguage } from "@avs/story";

export interface DirectorCharacter {
  /** The id of the character on the board. */
  readonly id: string;
  readonly name: string;
  readonly appearance?: string;
  /** True for a revered figure that must not be shown directly when the profile restricts depiction. */
  readonly restricted?: boolean;
}

export interface DirectorEnvironment {
  readonly id: string;
  readonly name: string;
}

export interface DirectorScene {
  readonly index: number;
  readonly title: string;
  readonly summary: string;
  readonly targetSec: number;
  /** Place name from the outline. Matched to an environment by name. */
  readonly location: string;
  /** Character names from the outline. */
  readonly characters: readonly string[];
  /** The written scene: narration, and dialogue as "Name: spoken words". */
  readonly text: string;
}

export interface DirectorInput {
  readonly projectId: string;
  readonly language: StoryLanguage;
  readonly profile: GenreProfile;
  readonly scenes: readonly DirectorScene[];
  readonly characters: readonly DirectorCharacter[];
  readonly environments: readonly DirectorEnvironment[];
}

export interface PlannedLine {
  readonly kind: "dialogue" | "narration";
  /** Board character id, or null for narration. */
  readonly speakerId: string | null;
  readonly speakerName: string | null;
  readonly text: string;
  /** Estimated speaking time including a short pause. */
  readonly durationMs: number;
}

export interface PlannedShot {
  readonly id: string;
  readonly sceneIndex: number;
  readonly index: number;
  readonly shotType: ShotType;
  readonly treatment: "direct" | "symbolic";
  readonly symbol: SymbolicKind | null;
  readonly motion: CameraMotion;
  /** Camera direction inside the 360 panorama, in degrees. */
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly durationMs: number;
  /** Characters visible in the frame. */
  readonly characterIds: readonly string[];
  readonly lines: readonly PlannedLine[];
  readonly transitionOut: Transition;
  /** Starting prompt for the image or video model. */
  readonly prompt: string;
}

export interface PlannedScene {
  readonly index: number;
  readonly title: string;
  readonly summary: string;
  readonly targetSec: number;
  readonly environmentId: string | null;
  readonly characterIds: readonly string[];
  readonly baseYaw: number;
  shots: PlannedShot[];
}

export interface DirectorPlan {
  readonly projectId: string;
  readonly profileId: string;
  readonly scenes: PlannedScene[];
  readonly totalMs: number;
  /** Notes for the user, for example "scene_overrun:3" or "restricted_depiction:Ravi". */
  readonly warnings: readonly string[];
  readonly negativePrompt: string;
}

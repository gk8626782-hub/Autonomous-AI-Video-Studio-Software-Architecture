import type { CharacterView } from "./slots";

export interface CharacterDescription {
  readonly name: string;
  readonly species: string;
  readonly ageGroup: string;
  readonly gender: string;
  readonly appearance: string;
}

export const VIEW_LABELS: Readonly<Record<CharacterView, string>> = {
  front: "front view, facing the camera",
  left: "left side profile view",
  right: "right side profile view",
  back: "back view, facing away from the camera",
  threeQuarter: "three-quarter view",
};

function describeCharacter(character: CharacterDescription): string {
  const gender = character.gender === "male" || character.gender === "female" ? character.gender : "";
  const age = character.ageGroup === "unknown" ? "" : character.ageGroup;
  return [age, gender, character.species].filter((part) => part !== "").join(" ");
}

export function viewPrompt(character: CharacterDescription, view: CharacterView, styleHint: string): string {
  return [
    `Character design sheet of ${character.name}: ${describeCharacter(character)}.`,
    character.appearance === "" ? "" : `Appearance: ${character.appearance}.`,
    `Pose and angle: ${VIEW_LABELS[view]}, full body, neutral standing pose, plain light background.`,
    styleHint === "" ? "" : `Art style: ${styleHint}.`,
    "Keep the exact same face, clothes, colors and proportions in every view.",
  ]
    .filter((part) => part !== "")
    .join(" ");
}

export function panoramaPrompt(
  environment: { readonly name: string; readonly description: string },
  styleHint: string,
): string {
  return [
    `Seamless 360-degree equirectangular panorama, 2:1 aspect ratio, of ${environment.name}.`,
    environment.description === "" ? "" : `${environment.description}.`,
    styleHint === "" ? "" : `Art style: ${styleHint}.`,
    "The left and right edges must connect seamlessly. Level horizon in the middle. No people, no text, no watermark.",
  ]
    .filter((part) => part !== "")
    .join(" ");
}

"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { NewCharacterInput } from "../lib/board-controller";
import { useT } from "../lib/i18n";

const SPECIES = [
  "human",
  "dog",
  "cat",
  "elephant",
  "lion",
  "tiger",
  "horse",
  "cow",
  "bird",
  "monkey",
  "rabbit",
  "mouse",
  "robot",
  "creature",
] as const;
const AGE_GROUPS = ["child", "teen", "adult", "elder", "unknown"] as const;
const GENDERS = ["male", "female", "neutral", "unknown"] as const;

interface AddCharacterFormProps {
  readonly busy: boolean;
  readonly onAdd: (input: NewCharacterInput) => Promise<void>;
}

export function AddCharacterForm({ busy, onAdd }: AddCharacterFormProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<string>("human");
  const [ageGroup, setAgeGroup] = useState<string>("adult");
  const [gender, setGender] = useState<string>("unknown");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      return;
    }
    await onAdd({ name: trimmed, species, ageGroup, gender });
    setName("");
  }

  return (
    <form className="card form" onSubmit={(event) => void handleSubmit(event)}>
      <label>
        {t("ui.board.characterName")}
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        {t("ui.board.species")}
        <select value={species} onChange={(event) => setSpecies(event.target.value)}>
          {SPECIES.map((value) => (
            <option key={value} value={value}>
              {t(`ui.species.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("ui.board.ageGroup")}
        <select value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)}>
          {AGE_GROUPS.map((value) => (
            <option key={value} value={value}>
              {t(`ui.age.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("ui.board.gender")}
        <select value={gender} onChange={(event) => setGender(event.target.value)}>
          {GENDERS.map((value) => (
            <option key={value} value={value}>
              {t(`ui.gender.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="primary" disabled={busy || name.trim() === ""}>
        {t("ui.board.addCharacter")}
      </button>
    </form>
  );
}

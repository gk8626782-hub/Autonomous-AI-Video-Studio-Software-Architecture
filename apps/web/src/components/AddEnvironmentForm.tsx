"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { NewEnvironmentInput } from "../lib/board-controller";
import { useT } from "../lib/i18n";

interface AddEnvironmentFormProps {
  readonly busy: boolean;
  readonly onAdd: (input: NewEnvironmentInput) => Promise<void>;
}

export function AddEnvironmentForm({ busy, onAdd }: AddEnvironmentFormProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      return;
    }
    await onAdd({ name: trimmed, description: description.trim() });
    setName("");
    setDescription("");
  }

  return (
    <form className="card form" onSubmit={(event) => void handleSubmit(event)}>
      <label>
        {t("ui.env.name")}
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        {t("ui.env.description")}
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <button type="submit" className="primary" disabled={busy || name.trim() === ""}>
        {t("ui.board.addEnvironment")}
      </button>
    </form>
  );
}

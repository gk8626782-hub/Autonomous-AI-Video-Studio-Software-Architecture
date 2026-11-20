"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { toAppError } from "@avs/core";
import type { ProjectLanguage, ProjectRecord } from "@avs/storage";
import { getProjectRepository } from "../lib/db";

const LANGUAGE_LABELS: Record<ProjectLanguage, string> = {
  hi: "Hindi",
  en: "English",
  hinglish: "Hinglish",
};

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(10);
  const [language, setLanguage] = useState<ProjectLanguage>("hi");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProjects(await getProjectRepository().list());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await getProjectRepository().create({ title, language, durationMinTarget: duration });
      setTitle("");
      setError(null);
      await refresh();
    } catch (cause) {
      setError(toAppError(cause).message);
    }
  }

  async function handleDelete(id: string) {
    // Media files are removed in a later phase once OPFS storage exists.
    await getProjectRepository().remove(id);
    await refresh();
  }

  return (
    <main className="home">
      <header>
        <h1>AI Video Studio</h1>
        <p className="muted">Your projects</p>
      </header>

      <form className="card form" onSubmit={handleCreate}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My first film" />
        </label>
        <label>
          Duration (minutes)
          <input
            type="number"
            min={1}
            max={240}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>
        <label>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value as ProjectLanguage)}>
            {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary">
          New project
        </button>
        {error !== null && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>

      <section className="grid" aria-label="Projects">
        {projects.length === 0 && <p className="muted">No projects yet.</p>}
        {projects.map((project) => (
          <article key={project.id} className="card">
            <h2>{project.title}</h2>
            <p className="muted">
              {LANGUAGE_LABELS[project.language]} · {project.durationMinTarget} min · {project.status}
            </p>
            <button type="button" onClick={() => void handleDelete(project.id)}>
              Delete
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

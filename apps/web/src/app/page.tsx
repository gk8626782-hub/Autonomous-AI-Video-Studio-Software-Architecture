"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "@avs/i18n";
import type { ProjectLanguage, ProjectRecord } from "@avs/storage";
import { LocaleSwitch } from "../components/LocaleSwitch";
import { getProjectRepository } from "../lib/db";
import { useT } from "../lib/i18n";
import { getServices } from "../lib/services";

const LANGUAGES: readonly ProjectLanguage[] = ["hi", "en", "hinglish"];

export default function HomePage() {
  const t = useT();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(10);
  const [language, setLanguage] = useState<ProjectLanguage>("hi");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProjects(await getProjectRepository().list());
  }, []);

  useEffect(() => {
    refresh().catch((cause: unknown) => setError(errorMessage(t, cause)));
    // The language only changes the messages, so the list is loaded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await getProjectRepository().create({ title, language, durationMinTarget: duration });
      setTitle("");
      setError(null);
      await refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("ui.confirm.delete"))) {
      return;
    }
    try {
      await getProjectRepository().remove(id);
      // Remove the project's files from private storage as well.
      await getServices().files.removeDirectory(`projects/${id}`);
      setError(null);
      await refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
      await refresh().catch(() => undefined);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>{t("ui.app.name")}</h1>
          <p className="muted">{t("ui.home.subtitle")}</p>
        </div>
        <LocaleSwitch />
      </header>

      <form className="card form" onSubmit={(event) => void handleCreate(event)}>
        <label>
          {t("ui.form.title")}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("ui.form.titlePlaceholder")}
          />
        </label>
        <label>
          {t("ui.form.duration")}
          <input
            type="number"
            min={1}
            max={240}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </label>
        <label>
          {t("ui.form.language")}
          <select value={language} onChange={(event) => setLanguage(event.target.value as ProjectLanguage)}>
            {LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {t(`ui.language.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary">
          {t("ui.home.newProject")}
        </button>
        {error !== null && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>

      <section className="grid" aria-label={t("ui.home.subtitle")}>
        {projects.length === 0 && <p className="muted">{t("ui.home.empty")}</p>}
        {projects.map((project) => (
          <article key={project.id} className="card">
            <h2>{project.title}</h2>
            <p className="muted">
              {t("ui.home.meta", {
                language: t(`ui.language.${project.language}`),
                minutes: project.durationMinTarget,
                status: t(`ui.status.${project.status}`),
              })}
            </p>
            <div className="slot-actions">
              <Link className="link-button primary" href={`/project/?id=${encodeURIComponent(project.id)}`}>
                {t("ui.action.open")}
              </Link>
              <button type="button" className="danger" onClick={() => void handleDelete(project.id)}>
                {t("ui.action.delete")}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

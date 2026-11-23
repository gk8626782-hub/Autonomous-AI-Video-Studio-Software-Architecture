"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GENERATE_SCOPE } from "@avs/board";
import { useBoardController } from "../lib/board-controller";
import { useT } from "../lib/i18n";
import { useProviderStatus } from "../lib/provider-status";
import { useAppStore } from "../store/app-store";
import { AddCharacterForm } from "./AddCharacterForm";
import { AddEnvironmentForm } from "./AddEnvironmentForm";
import { CharacterCard } from "./CharacterCard";
import { EnvironmentCard } from "./EnvironmentCard";
import { ScreenShell } from "./ScreenShell";
import { Section } from "./Section";
import { StoragePanel } from "./StoragePanel";
import { ValidationPanel } from "./ValidationPanel";

interface ProjectScreenProps {
  readonly projectId: string | null;
}

/** The project board: story status, characters, environments, providers and storage. */
export function ProjectScreen({ projectId }: ProjectScreenProps) {
  const t = useT();
  const controller = useBoardController(projectId);
  const state = useAppStore();
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  useProviderStatus();

  const alertPath = state.ui_alertPath;
  const setAlertPath = state.ui_setAlertPath;

  // Red alert: scroll to the slot that needs attention and let it blink for a few seconds.
  useEffect(() => {
    if (alertPath === null) {
      return;
    }
    const target = document.querySelector(alertPath);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });

    const timer = window.setTimeout(() => setAlertPath(null), 3800);
    return () => window.clearTimeout(timer);
  }, [alertPath, setAlertPath]);

  if (projectId === null) {
    return (
      <ScreenShell title={t("ui.app.name")}>
        <p className="muted">{t("ui.project.missingId")}</p>
      </ScreenShell>
    );
  }
  if (controller.project === undefined) {
    return (
      <ScreenShell title={t("ui.app.name")}>
        <p className="muted">{t("ui.project.loading")}</p>
      </ScreenShell>
    );
  }
  if (controller.project === null) {
    return (
      <ScreenShell title={t("ui.app.name")}>
        <p className="error">{t("ui.project.notFound")}</p>
      </ScreenShell>
    );
  }

  const project = controller.project;
  const { actions, busy } = controller;
  const issues = controller.registry.evaluate(GENERATE_SCOPE);

  const handleGenerate = (): void => {
    const first = controller.registry.firstIssue(GENERATE_SCOPE);
    if (first !== undefined) {
      setAlertPath(first.domPath ?? null);
      return;
    }
    setLaunchNotice(t("ui.generate.comingSoon"));
  };

  return (
    <ScreenShell title={project.title}>
      <ValidationPanel
        issues={issues}
        characters={state.char_items}
        environments={state.env_items}
        onJump={(path) => setAlertPath(path ?? null)}
        onGenerate={handleGenerate}
      />

      {controller.error !== null && (
        <p role="alert" className="error">
          {controller.error}
        </p>
      )}
      {controller.notice !== null && <p className="notice">{controller.notice}</p>}
      {launchNotice !== null && <p className="notice">{launchNotice}</p>}

      <Section name="story" title={t("ui.project.section.story")}>
        <p>{t("ui.story.duration", { minutes: project.durationMinTarget })}</p>
        <p className={state.story_passed ? "ok" : "muted"}>
          {state.story_passed ? t("ui.story.passed") : t("ui.story.notChecked")}
        </p>
      </Section>

      <Section name="characters" title={t("ui.project.section.characters")}>
        {state.char_items.length === 0 && <p className="muted">{t("ui.board.characters.empty")}</p>}
        <div className="grid grid-wide">
          {state.char_items.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              statuses={state.media_statuses}
              busy={busy}
              actions={actions}
            />
          ))}
        </div>
        <AddCharacterForm busy={busy} onAdd={actions.addCharacter} />
      </Section>

      <Section name="environments" title={t("ui.project.section.environments")}>
        {state.env_items.length === 0 && <p className="muted">{t("ui.board.environments.empty")}</p>}
        <div className="grid grid-wide">
          {state.env_items.map((environment) => (
            <EnvironmentCard
              key={environment.id}
              environment={environment}
              statuses={state.media_statuses}
              busy={busy}
              actions={actions}
            />
          ))}
        </div>
        <AddEnvironmentForm busy={busy} onAdd={actions.addEnvironment} />
      </Section>

      <Section name="providers" title={t("ui.project.section.providers")}>
        <p className="muted">
          {state.ai_configured.length === 0
            ? t("ui.providers.noneYet")
            : t("ui.providers.capabilities", {
                list: state.ai_configured.map((capability) => t(`ui.capability.${capability}`)).join(", "),
              })}
        </p>
        <div className="slot-actions">
          <Link href="/settings/" className="link-button">
            {t("ui.nav.settings")}
          </Link>
        </div>
      </Section>

      <Section name="storage" title={t("ui.project.section.storage")}>
        <StoragePanel busy={busy} onProtect={() => void actions.protectStorage()} />
      </Section>
    </ScreenShell>
  );
}

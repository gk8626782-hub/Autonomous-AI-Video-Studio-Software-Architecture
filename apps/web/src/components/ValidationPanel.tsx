"use client";

import type { ValidationIssue } from "@avs/core";
import type { CharacterRecord, EnvironmentRecord } from "@avs/storage";
import { useT } from "../lib/i18n";

interface ValidationPanelProps {
  readonly issues: readonly ValidationIssue[];
  readonly characters: readonly CharacterRecord[];
  readonly environments: readonly EnvironmentRecord[];
  readonly onJump: (domPath: string | undefined) => void;
  readonly onGenerate: () => void;
}

/** Rule ids look like "char:<id>:view:front". Returns the name of the character or place. */
function subjectOf(
  id: string,
  characters: readonly CharacterRecord[],
  environments: readonly EnvironmentRecord[],
): string {
  const [kind, entityId] = id.split(":");
  if (kind === "char") {
    return characters.find((item) => item.id === entityId)?.name ?? "";
  }
  if (kind === "env") {
    return environments.find((item) => item.id === entityId)?.name ?? "";
  }
  return "";
}

export function ValidationPanel({ issues, characters, environments, onJump, onGenerate }: ValidationPanelProps) {
  const t = useT();
  const locked = issues.length > 0;

  return (
    <section className="card validation">
      <h2 className="section-title">{locked ? t("ui.validation.title") : t("ui.validation.allGood")}</h2>

      {locked && (
        <ul className="issue-list">
          {issues.map((issue) => {
            const subject = subjectOf(issue.id, characters, environments);
            return (
              <li key={issue.id}>
                <button type="button" className="issue" onClick={() => onJump(issue.domPath)}>
                  {t(issue.messageKey)}
                  {subject !== "" ? ` — ${subject}` : ""}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* The button stays clickable while locked: pressing it points at the first problem. */}
      <button
        type="button"
        className={locked ? "generate locked" : "generate"}
        aria-disabled={locked}
        onClick={onGenerate}
      >
        {t("ui.action.generate")}
      </button>
    </section>
  );
}

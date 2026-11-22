"use client";

import type { EnvironmentRecord, MediaStatus } from "@avs/storage";
import type { BoardActions } from "../lib/board-controller";
import { useT } from "../lib/i18n";
import { ImageSlot } from "./ImageSlot";

const IMAGE_TYPES = "image/png,image/jpeg,image/webp";

interface EnvironmentCardProps {
  readonly environment: EnvironmentRecord;
  readonly statuses: Readonly<Record<string, MediaStatus>>;
  readonly busy: boolean;
  readonly actions: BoardActions;
}

export function EnvironmentCard({ environment, statuses, busy, actions }: EnvironmentCardProps) {
  const t = useT();
  const id = environment.id;
  const mediaId = environment.panoramaRef;
  const seamVisible = environment.seamScore !== null && environment.seamScore > 1;

  return (
    <article className="card environment-card">
      <header className="card-head">
        <div>
          <h3>{environment.name}</h3>
          {environment.description !== undefined && environment.description !== "" && (
            <p className="muted">{environment.description}</p>
          )}
        </div>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("ui.confirm.delete"))) {
              void actions.removeEnvironment(id);
            }
          }}
        >
          {t("ui.action.remove")}
        </button>
      </header>

      <ImageSlot
        wide
        slot={`env-${id}-panorama`}
        label={t("ui.env.panorama")}
        mediaId={mediaId}
        status={mediaId === null ? undefined : statuses[mediaId]}
        accept={IMAGE_TYPES}
        disabled={busy}
        onPick={(file) => void actions.uploadPanorama(id, file)}
        onClear={() => void actions.clearPanorama(id)}
      />

      <p className="muted">{t("ui.panorama.hint")}</p>
      {seamVisible && <p className="error">{t("ui.env.issue.seam_visible")}</p>}
    </article>
  );
}

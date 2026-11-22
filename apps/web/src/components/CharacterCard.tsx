"use client";

import { useRef } from "react";
import { REQUIRED_VIEWS, deriveVoiceProfile, isVoiceComplete, missingViews } from "@avs/board";
import type { CharacterView } from "@avs/board";
import type { CharacterRecord, MediaStatus } from "@avs/storage";
import type { BoardActions } from "../lib/board-controller";
import { useT } from "../lib/i18n";
import { labelOrRaw } from "../lib/labels";
import { useMediaUrl } from "../lib/media-url";
import { ImageSlot } from "./ImageSlot";
import { SlotFrame } from "./SlotFrame";

const VIEWS: readonly CharacterView[] = [...REQUIRED_VIEWS, "threeQuarter"];
const IMAGE_TYPES = "image/png,image/jpeg,image/webp";

interface CharacterCardProps {
  readonly character: CharacterRecord;
  readonly statuses: Readonly<Record<string, MediaStatus>>;
  readonly busy: boolean;
  readonly actions: BoardActions;
}

export function CharacterCard({ character, statuses, busy, actions }: CharacterCardProps) {
  const t = useT();
  const voiceInput = useRef<HTMLInputElement>(null);
  const sampleUrl = useMediaUrl(character.voiceSlot.sampleRef);

  const id = character.id;
  const viewsLocked = character.viewsLocked === true;
  const voice = character.voiceSlot;
  const missing = missingViews(character.viewSlots);
  const profile = deriveVoiceProfile(character);
  const sampleMissing =
    voice.sampleRef !== null && statuses[voice.sampleRef] !== undefined && statuses[voice.sampleRef] !== "ok";

  return (
    <article className="card character-card">
      <header className="card-head">
        <div>
          <h3>{character.name}</h3>
          <p className="muted">
            {t("ui.char.summary", {
              species: labelOrRaw(t, "ui.species", character.species),
              age: labelOrRaw(t, "ui.age", character.ageGroup),
              gender: labelOrRaw(t, "ui.gender", character.gender),
            })}
          </p>
        </div>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("ui.confirm.delete"))) {
              void actions.removeCharacter(id);
            }
          }}
        >
          {t("ui.action.remove")}
        </button>
      </header>

      <h4 className="subhead">{t("ui.board.views")}</h4>
      <div className="views-grid">
        {VIEWS.map((view) => {
          const mediaId = character.viewSlots[view];
          return (
            <ImageSlot
              key={view}
              slot={`char-${id}-view-${view}`}
              label={t(`ui.view.${view}`)}
              mediaId={mediaId}
              status={mediaId === null ? undefined : statuses[mediaId]}
              accept={IMAGE_TYPES}
              disabled={busy || viewsLocked}
              onPick={(file) => void actions.uploadView(id, view, file)}
              onClear={() => void actions.clearView(id, view)}
            />
          );
        })}
      </div>

      <SlotFrame slot={`char-${id}-views-lock`} label={t("ui.views.lockLabel")}>
        {viewsLocked ? (
          <>
            <p className="ok">{t("ui.views.locked")}</p>
            <div className="slot-actions">
              <button type="button" disabled={busy} onClick={() => void actions.unlockViews(id)}>
                {t("ui.action.unlock")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{t("ui.views.lockHint")}</p>
            <div className="slot-actions">
              <button
                type="button"
                disabled={busy || missing.length > 0}
                onClick={() => void actions.lockViews(id)}
              >
                {t("ui.action.lock")}
              </button>
            </div>
          </>
        )}
      </SlotFrame>

      <SlotFrame slot={`char-${id}-voice`} label={t("ui.board.voice")}>
        <p className="muted">
          {t("ui.voice.profile", {
            pitch: t(`ui.pitch.${profile.pitch}`),
            pace: t(`ui.pace.${profile.pace}`),
          })}
        </p>
        {voice.sampleRef !== null &&
          (sampleMissing ? (
            <p className="slot-missing">{t("ui.media.missing")}</p>
          ) : (
            sampleUrl !== null && <audio controls src={sampleUrl} />
          ))}
        {voice.locked && <p className="ok">{t("ui.voice.locked")}</p>}
        <p className="muted">{t("ui.voice.aiLater")}</p>
        <div className="slot-actions">
          <button type="button" disabled={busy || voice.locked} onClick={() => voiceInput.current?.click()}>
            {t("ui.voice.upload")}
          </button>
          {voice.locked ? (
            <button type="button" disabled={busy} onClick={() => void actions.unlockVoice(id)}>
              {t("ui.action.unlock")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !isVoiceComplete(voice)}
              onClick={() => void actions.lockVoice(id)}
            >
              {t("ui.action.lock")}
            </button>
          )}
          <input
            ref={voiceInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) {
                void actions.uploadVoice(id, file);
              }
            }}
          />
        </div>
      </SlotFrame>
    </article>
  );
}

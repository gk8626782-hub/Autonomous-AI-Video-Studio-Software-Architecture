"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import type { MediaStatus } from "@avs/storage";
import { useT } from "../lib/i18n";
import { useMediaUrl } from "../lib/media-url";
import { SlotFrame } from "./SlotFrame";

interface ImageSlotProps {
  readonly slot: string;
  readonly label: string;
  readonly mediaId: string | null;
  readonly status: MediaStatus | undefined;
  readonly accept: string;
  readonly disabled: boolean;
  readonly wide?: boolean;
  readonly onPick: (file: File) => void;
  readonly onClear?: () => void;
}

/** An image slot: preview, upload or replace, and clear. Shows a red notice when the file is missing. */
export function ImageSlot({
  slot,
  label,
  mediaId,
  status,
  accept,
  disabled,
  wide = false,
  onPick,
  onClear,
}: ImageSlotProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const url = useMediaUrl(mediaId);
  const missing = mediaId !== null && status !== undefined && status !== "ok";

  let preview: ReactNode;
  if (mediaId === null) {
    preview = <span className="slot-empty">{t("ui.slot.empty")}</span>;
  } else if (missing) {
    preview = <span className="slot-missing">{t("ui.media.missing")}</span>;
  } else if (url !== null) {
    preview = <img src={url} alt={label} />;
  } else {
    preview = <span className="slot-empty">...</span>;
  }

  return (
    <SlotFrame slot={slot} label={label} wide={wide}>
      <div className="slot-image">{preview}</div>
      <div className="slot-actions">
        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {mediaId === null ? t("ui.action.upload") : t("ui.action.replace")}
        </button>
        {mediaId !== null && onClear !== undefined && (
          <button type="button" disabled={disabled} onClick={onClear}>
            {t("ui.action.clear")}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) {
              onPick(file);
            }
          }}
        />
      </div>
    </SlotFrame>
  );
}

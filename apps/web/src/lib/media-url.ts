"use client";

import { useEffect, useState } from "react";
import { getDatabase } from "./db";
import { getServices } from "./services";

/** Turns a media file in private storage into a temporary URL for <img> and <audio>. */
export function useMediaUrl(mediaId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (mediaId === null) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let created: string | null = null;

    void (async () => {
      const record = await getDatabase().mediaRefs.get(mediaId);
      if (record === undefined || cancelled) {
        return;
      }
      const blob = await getServices().files.read(record.opfsPath);
      if (blob === null || cancelled) {
        return;
      }
      created = URL.createObjectURL(blob);
      setUrl(created);
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      if (created !== null) {
        URL.revokeObjectURL(created);
      }
    };
  }, [mediaId]);

  return url;
}

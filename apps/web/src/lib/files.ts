import { AppError } from "@avs/core";

const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

/** File extension for an uploaded audio type. Unsupported types are rejected with a translatable error. */
export function audioExtensionForMime(mime: string): string {
  const extension = AUDIO_EXTENSIONS[mime.toLowerCase()];
  if (extension === undefined) {
    throw new AppError({
      code: "media.unsupported_audio",
      category: "media",
      messageKey: "error.media.unsupportedAudio",
      message: `Unsupported audio type: ${mime}`,
      recoverable: true,
      details: { mime },
    });
  }
  return extension;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const text = index === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return `${text} ${units[index] ?? "B"}`;
}

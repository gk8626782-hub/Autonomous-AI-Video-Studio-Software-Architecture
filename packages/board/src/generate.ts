import { AppError } from "@avs/core";
import { awaitOutput, providerError } from "@avs/providers";
import type { AdapterContext, ImageRequest, ProviderAdapter } from "@avs/providers";
import type { MediaRefRecord, MediaService } from "@avs/storage";
import { preparePanorama } from "./image-io";
import type { ImageCodec } from "./image-io";
import type { PanoramaCheckOptions, PanoramaReport } from "./panorama";
import { panoramaPrompt, viewPrompt } from "./prompts";
import type { CharacterDescription } from "./prompts";
import { REQUIRED_VIEWS } from "./slots";
import type { CharacterView } from "./slots";

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function extensionForMime(mime: string): string {
  const extension = IMAGE_EXTENSIONS[mime.toLowerCase()];
  if (extension === undefined) {
    throw new AppError({
      code: "media.unsupported_mime",
      category: "media",
      messageKey: "error.media.unsupportedMime",
      message: `Unsupported image type: ${mime}`,
      recoverable: false,
      details: { mime },
    });
  }
  return extension;
}

export async function toBlob(data: Blob | ReadableStream<Uint8Array>, mime: string): Promise<Blob> {
  if (data instanceof Blob) {
    return data;
  }
  const parts: BlobPart[] = [];
  const reader = data.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value as unknown as BlobPart);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(parts, { type: mime });
}

interface CommonArgs {
  readonly adapter: ProviderAdapter;
  readonly context: AdapterContext;
  readonly media: MediaService;
  readonly projectId: string;
  readonly styleHint: string;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface GenerateViewArgs extends CommonArgs {
  readonly character: CharacterDescription;
  readonly view: CharacterView;
  /** Earlier views of the same character, sent as references for consistency. */
  readonly referenceMediaIds?: readonly string[];
  readonly seed?: number;
}

/** Generates one angle of a character and stores it as an AI-origin image. */
export async function generateCharacterView(args: GenerateViewArgs): Promise<MediaRefRecord> {
  const request: ImageRequest = {
    capability: "image",
    prompt: viewPrompt(args.character, args.view, args.styleHint),
    width: 1024,
    height: 1536,
    referenceMediaIds: args.referenceMediaIds,
    seed: args.seed,
  };

  const handle = await args.adapter.submit(request, args.context);
  const output = await awaitOutput(args.adapter, handle, args.context, { sleep: args.sleep });
  if (output.kind !== "media" || !output.mime.startsWith("image/")) {
    throw providerError("bad_output", {
      providerId: args.adapter.manifest.id,
      message: "Expected an image from the provider",
    });
  }

  return args.media.ingest(output.data, {
    projectId: args.projectId,
    kind: "image",
    origin: "ai",
    mime: output.mime,
    extension: extensionForMime(output.mime),
    width: output.width ?? null,
    height: output.height ?? null,
    providerJobId: handle.providerJobId,
  });
}

export interface GenerateSetArgs extends Omit<GenerateViewArgs, "view" | "referenceMediaIds"> {
  /** Which views to generate. Default: the four required views. */
  readonly views?: readonly CharacterView[];
  /** An approved front view to use as the reference when front itself is not regenerated. */
  readonly existingFrontMediaId?: string | null;
}

/**
 * Generates several views of one character. The front view comes first and
 * every other view uses it as a reference, so the design stays the same.
 */
export async function generateCharacterSet(
  args: GenerateSetArgs,
): Promise<Partial<Record<CharacterView, MediaRefRecord>>> {
  const { views: requested, existingFrontMediaId, ...base } = args;
  const views = requested ?? REQUIRED_VIEWS;
  const results: Partial<Record<CharacterView, MediaRefRecord>> = {};
  let frontId = existingFrontMediaId ?? null;

  if (views.includes("front")) {
    const front = await generateCharacterView({ ...base, view: "front" });
    results.front = front;
    frontId = front.id;
  }

  for (const view of views) {
    if (view === "front") {
      continue;
    }
    results[view] = await generateCharacterView({
      ...base,
      view,
      ...(frontId === null ? {} : { referenceMediaIds: [frontId] }),
    });
  }

  return results;
}

export interface GeneratePanoramaArgs extends CommonArgs {
  readonly codec: ImageCodec;
  readonly environment: { readonly name: string; readonly description: string };
  readonly width?: number;
  readonly height?: number;
  readonly assess?: PanoramaCheckOptions;
  readonly autoFixSeam?: boolean;
}

export interface GeneratedPanorama {
  readonly media: MediaRefRecord;
  readonly report: PanoramaReport;
  readonly fixedSeam: boolean;
}

/**
 * Generates a 360 panorama, checks it, repairs a visible seam and stores it.
 * A result that fails the checks is rejected as bad output so it can be retried.
 */
export async function generatePanorama(args: GeneratePanoramaArgs): Promise<GeneratedPanorama> {
  const request: ImageRequest = {
    capability: "image",
    prompt: panoramaPrompt(args.environment, args.styleHint),
    width: args.width ?? 2048,
    height: args.height ?? 1024,
  };

  const handle = await args.adapter.submit(request, args.context);
  const output = await awaitOutput(args.adapter, handle, args.context, { sleep: args.sleep });
  if (output.kind !== "media" || !output.mime.startsWith("image/")) {
    throw providerError("bad_output", {
      providerId: args.adapter.manifest.id,
      message: "Expected an image from the provider",
    });
  }

  const original = await toBlob(output.data, output.mime);
  const prepared = await preparePanorama(original, args.codec, {
    ...args.assess,
    autoFixSeam: args.autoFixSeam ?? true,
  });

  if (!prepared.report.ok) {
    const codes = prepared.report.issues.map((issue) => issue.code).join(", ");
    throw providerError("bad_output", {
      providerId: args.adapter.manifest.id,
      message: `The generated panorama failed checks: ${codes}`,
    });
  }

  const mime = prepared.blob.type !== "" ? prepared.blob.type : output.mime;
  const media = await args.media.ingest(prepared.blob, {
    projectId: args.projectId,
    kind: "panorama",
    origin: "ai",
    mime,
    extension: extensionForMime(mime),
    width: prepared.fixedSeam ? prepared.report.width : (output.width ?? prepared.report.width),
    height: prepared.fixedSeam ? prepared.report.height : (output.height ?? prepared.report.height),
    providerJobId: handle.providerJobId,
  });

  return { media, report: prepared.report, fixedSeam: prepared.fixedSeam };
}

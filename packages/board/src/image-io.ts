import { AppError } from "@avs/core";
import { assessPanorama, blendSeam, fitSize } from "./panorama";
import type { PanoramaCheckOptions, PanoramaReport, RgbaImage } from "./panorama";

export interface DecodeOptions {
  readonly maxWidth: number;
  readonly maxHeight: number;
}

/** Turns image files into pixels and back. Injectable so tests need no browser. */
export interface ImageCodec {
  decode(blob: Blob, options: DecodeOptions): Promise<RgbaImage>;
  encode(image: RgbaImage, mime: string): Promise<Blob>;
}

function codecUnsupported(): AppError {
  return new AppError({
    code: "board.codec_unsupported",
    category: "media",
    messageKey: "error.board.codecUnsupported",
    message: "This browser cannot decode or encode images off-screen",
    recoverable: false,
  });
}

/** Browser implementation based on createImageBitmap and OffscreenCanvas. */
export function createBrowserImageCodec(): ImageCodec {
  return {
    async decode(blob, options) {
      if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
        throw codecUnsupported();
      }
      const bitmap = await createImageBitmap(blob);
      try {
        const size = fitSize(bitmap.width, bitmap.height, options.maxWidth, options.maxHeight);
        const canvas = new OffscreenCanvas(size.width, size.height);
        const context = canvas.getContext("2d");
        if (context === null) {
          throw codecUnsupported();
        }
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const pixels = context.getImageData(0, 0, size.width, size.height);
        return { width: size.width, height: size.height, data: pixels.data };
      } finally {
        bitmap.close();
      }
    },

    async encode(image, mime) {
      if (typeof OffscreenCanvas === "undefined") {
        throw codecUnsupported();
      }
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (context === null) {
        throw codecUnsupported();
      }
      const target = context.createImageData(image.width, image.height);
      target.data.set(image.data);
      context.putImageData(target, 0, 0);
      return canvas.convertToBlob({ type: mime, quality: 0.92 });
    },
  };
}

export interface PreparePanoramaOptions extends PanoramaCheckOptions {
  /** Images are scaled down to fit before checking, to protect GPU memory. Default 4096. */
  readonly maxWidth?: number;
  /** Default 2048. */
  readonly maxHeight?: number;
  /** Blend a visible seam automatically. Default true. */
  readonly autoFixSeam?: boolean;
  /** Format of the repaired image. Default image/jpeg. */
  readonly outputMime?: string;
}

export interface PreparedPanorama {
  /** The original file, or the repaired and scaled version when the seam was fixed. */
  readonly blob: Blob;
  readonly report: PanoramaReport;
  readonly fixedSeam: boolean;
}

/**
 * Checks a panorama and repairs a visible seam. Wrong proportions or a tiny
 * image are not repairable, so those are only reported.
 */
export async function preparePanorama(
  blob: Blob,
  codec: ImageCodec,
  options: PreparePanoramaOptions = {},
): Promise<PreparedPanorama> {
  let image = await codec.decode(blob, {
    maxWidth: options.maxWidth ?? 4096,
    maxHeight: options.maxHeight ?? 2048,
  });
  let report = assessPanorama(image, options);

  const seamVisible = report.issues.some((issue) => issue.code === "seam_visible");
  const otherErrors = report.issues.some(
    (issue) => issue.severity === "error" && issue.code !== "seam_visible",
  );

  if (seamVisible && !otherErrors && options.autoFixSeam !== false) {
    image = blendSeam(image);
    report = assessPanorama(image, options);
    const repaired = await codec.encode(image, options.outputMime ?? "image/jpeg");
    return { blob: repaired, report, fixedSeam: true };
  }

  return { blob, report, fixedSeam: false };
}

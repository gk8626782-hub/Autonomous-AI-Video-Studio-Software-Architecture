/** Raw pixels, four bytes per pixel (red, green, blue, alpha). */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** An equirectangular 360 panorama is exactly twice as wide as it is high. */
export const PANORAMA_ASPECT = 2;

/** A seam is invisible when its colour jump is at most this many times a normal neighbour jump. */
export const SEAM_RATIO_MAX = 3;
/** Jumps up to this size (out of 255) are never visible. */
export const SEAM_ABSOLUTE_OK = 4;
const SEAM_BASELINE_FLOOR = 1;

export type PanoramaIssueCode = "bad_aspect" | "too_small" | "low_resolution" | "seam_visible";

export interface PanoramaIssue {
  readonly code: PanoramaIssueCode;
  readonly severity: "error" | "warning";
}

export interface PanoramaCheckOptions {
  /** Allowed deviation from 2:1 as a fraction. Default 0.02. */
  readonly aspectTolerance?: number;
  /** Narrower images are rejected. Default 1024. */
  readonly minWidth?: number;
  /** Narrower images get a low-resolution warning. Default 2048. */
  readonly recommendedWidth?: number;
  readonly seamRatioMax?: number;
  readonly seamAbsoluteOk?: number;
}

export function checkPanoramaDimensions(
  width: number,
  height: number,
  options: PanoramaCheckOptions = {},
): PanoramaIssue[] {
  const tolerance = options.aspectTolerance ?? 0.02;
  const minWidth = options.minWidth ?? 1024;
  const recommendedWidth = options.recommendedWidth ?? 2048;
  const issues: PanoramaIssue[] = [];

  const aspectOk = height > 0 && Math.abs(width / height - PANORAMA_ASPECT) / PANORAMA_ASPECT <= tolerance;
  if (!aspectOk) {
    issues.push({ code: "bad_aspect", severity: "error" });
  }
  if (width < minWidth) {
    issues.push({ code: "too_small", severity: "error" });
  } else if (width < recommendedWidth) {
    issues.push({ code: "low_resolution", severity: "warning" });
  }
  return issues;
}

/** Largest size that fits inside the limits and keeps the aspect ratio. Never upscales. */
export function fitSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function channel(data: Uint8ClampedArray, index: number): number {
  return data[index] ?? 0;
}

/** Average colour difference (0-255) between two pixel columns. */
function columnDifference(image: RgbaImage, a: number, b: number): number {
  const { width, height, data } = image;
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    const ia = (y * width + a) * 4;
    const ib = (y * width + b) * 4;
    total +=
      Math.abs(channel(data, ia) - channel(data, ib)) +
      Math.abs(channel(data, ia + 1) - channel(data, ib + 1)) +
      Math.abs(channel(data, ia + 2) - channel(data, ib + 2));
  }
  return total / (height * 3);
}

export interface SeamMeasure {
  /** Colour jump between the last and the first column. */
  readonly seamDiff: number;
  /** Typical colour jump between neighbouring columns near the edges. */
  readonly baseline: number;
  readonly threshold: number;
  /** seamDiff relative to the threshold. 1 or less means the seam is not visible. */
  readonly score: number;
}

/**
 * When the left and right edges are joined (as they are in a 360 view) the
 * jump across the join should look like any other neighbouring columns.
 */
export function measureSeam(image: RgbaImage, options: PanoramaCheckOptions = {}): SeamMeasure {
  const ratioMax = options.seamRatioMax ?? SEAM_RATIO_MAX;
  const absoluteOk = options.seamAbsoluteOk ?? SEAM_ABSOLUTE_OK;
  const { width } = image;

  if (width < 3) {
    return { seamDiff: 0, baseline: 0, threshold: absoluteOk, score: 0 };
  }

  const seamDiff = columnDifference(image, width - 1, 0);
  const samples = Math.min(3, Math.floor((width - 1) / 2));
  const jumps: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    jumps.push(columnDifference(image, i, i + 1));
    jumps.push(columnDifference(image, width - 2 - i, width - 1 - i));
  }
  const baseline = jumps.reduce((total, jump) => total + jump, 0) / jumps.length;

  const threshold = Math.max(absoluteOk, ratioMax * Math.max(baseline, SEAM_BASELINE_FLOOR));
  return { seamDiff, baseline, threshold, score: seamDiff / threshold };
}

/**
 * Softens a visible seam. Pixels at the same distance from the join on both
 * sides are pulled towards each other, fully at the join and not at all at
 * the end of the blend strip. Returns a new image.
 */
export function blendSeam(image: RgbaImage, blendWidth?: number): RgbaImage {
  const { width, height } = image;
  const source = image.data;
  const data = new Uint8ClampedArray(source);
  const strip = Math.min(
    Math.max(1, blendWidth ?? Math.round(width * 0.05)),
    Math.floor(width / 2),
  );

  for (let i = 0; i < strip; i += 1) {
    const weight = 0.5 * (1 - i / strip);
    const left = i;
    const right = width - 1 - i;
    for (let y = 0; y < height; y += 1) {
      const li = (y * width + left) * 4;
      const ri = (y * width + right) * 4;
      for (let c = 0; c < 3; c += 1) {
        const l = channel(source, li + c);
        const r = channel(source, ri + c);
        data[ri + c] = r + (l - r) * weight;
        data[li + c] = l + (r - l) * weight;
      }
    }
  }

  return { width, height, data };
}

export interface PanoramaReport {
  readonly width: number;
  readonly height: number;
  readonly issues: readonly PanoramaIssue[];
  /** Stored on the environment. 1 or less means the seam is fine. */
  readonly seamScore: number;
  /** False when any error is present. Warnings do not block. */
  readonly ok: boolean;
}

export function assessPanorama(image: RgbaImage, options: PanoramaCheckOptions = {}): PanoramaReport {
  const issues = [...checkPanoramaDimensions(image.width, image.height, options)];
  const seam = measureSeam(image, options);
  if (seam.score > 1) {
    issues.push({ code: "seam_visible", severity: "error" });
  }
  return {
    width: image.width,
    height: image.height,
    issues,
    seamScore: seam.score,
    ok: !issues.some((issue) => issue.severity === "error"),
  };
}

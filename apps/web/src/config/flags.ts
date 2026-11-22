/** Reads a build-time flag. Only the strings "true" and "1" switch a flag on. */
export function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  return value === "true" || value === "1";
}

/**
 * Ads are off unless the official build sets NEXT_PUBLIC_ENABLE_ADS=true.
 * Open-source builds leave it unset, so no ad code runs.
 * The variables are read with dot notation so Next.js can inline them at build time.
 */
export const ENABLE_ADS: boolean = readFlag(process.env.NEXT_PUBLIC_ENABLE_ADS, false);

/** Pro features (ad-free, higher export quality). Off until billing exists. */
export const ENABLE_PRO: boolean = readFlag(process.env.NEXT_PUBLIC_ENABLE_PRO, false);

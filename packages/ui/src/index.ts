/** Breakpoints in px. Layout uses mobile-first min-width queries. */
export const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** Minimum touch target size in px. Mirrors --avs-touch-min in tokens.css. */
export const TOUCH_TARGET_MIN_PX = 44;

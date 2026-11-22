/** Small deterministic random numbers, so the same story always gets the same plan. */

/** FNV-1a hash of a string as an unsigned 32-bit number. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 generator seeded from a string. Returns numbers in [0, 1). */
export function createRng(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks a key with probability proportional to its weight. If every weight is zero, the first key wins. */
export function pickWeighted<T extends string>(weights: Readonly<Record<T, number>>, rng: () => number): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);

  if (total <= 0) {
    const first = entries[0];
    if (first === undefined) {
      throw new Error("pickWeighted needs at least one option");
    }
    return first[0];
  }

  let remaining = rng() * total;
  for (const [key, weight] of entries) {
    remaining -= Math.max(0, weight);
    if (remaining < 0) {
      return key;
    }
  }
  const last = entries[entries.length - 1];
  return (last as [T, number])[0];
}

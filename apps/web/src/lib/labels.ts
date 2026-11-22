import type { Translator } from "@avs/i18n";

/**
 * Translates a stored value such as a species or age group. Values that have
 * no translation (for example "golden retriever" from a story) are shown as they are.
 */
export function labelOrRaw(t: Translator, prefix: string, value: string): string {
  const key = `${prefix}.${value.trim().toLowerCase()}`;
  const label = t(key);
  return label === key ? value : label;
}

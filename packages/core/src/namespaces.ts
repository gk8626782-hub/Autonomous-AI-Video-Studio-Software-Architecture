/**
 * State namespace registry.
 *
 * Every state field, action, selector and persisted key must start with
 * "<namespace>_" (for example "story_durationMin" or "char_setVoice").
 *
 * Core namespaces are decided by the owner. Extra namespaces are proposed
 * and cover the remaining domains of the architecture.
 */
export const CORE_NAMESPACES = ["story", "char", "env", "device", "ui", "ads"] as const;

export const EXTRA_NAMESPACES = [
  "project",
  "media",
  "ai",
  "job",
  "render",
  "audio",
  "genre",
  "sync",
  "vault",
] as const;

export const NAMESPACES = [...CORE_NAMESPACES, ...EXTRA_NAMESPACES] as const;

export type Namespace = (typeof NAMESPACES)[number];

/** A key that is valid inside the given namespace, e.g. "story_title". */
export type PrefixedKey<N extends Namespace> = `${N}_${string}`;

/**
 * Compile-time guard. Resolves to T when every string key of T is prefixed
 * with the namespace, otherwise resolves to never so any use of the type fails.
 */
export type AssertPrefixed<N extends Namespace, T extends object> =
  Exclude<keyof T & string, PrefixedKey<N>> extends never ? T : never;

export function isNamespace(value: string): value is Namespace {
  return (NAMESPACES as readonly string[]).includes(value);
}

/** Returns the namespace a key belongs to, or undefined if it has no valid prefix. */
export function namespaceOf(key: string): Namespace | undefined {
  const separator = key.indexOf("_");
  if (separator <= 0) {
    return undefined;
  }
  const prefix = key.slice(0, separator);
  return isNamespace(prefix) ? prefix : undefined;
}

export type NamespaceViolationReason =
  | "unknown-namespace"
  | "unprefixed"
  | "wrong-namespace"
  | "duplicate";

export interface NamespaceViolation {
  readonly namespace: string;
  readonly key: string;
  readonly reason: NamespaceViolationReason;
}

/**
 * Runtime guard. Receives all slices keyed by their namespace and reports
 * unprefixed keys, keys that belong to another namespace, and duplicates.
 */
export function findNamespaceViolations(
  slices: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): NamespaceViolation[] {
  const violations: NamespaceViolation[] = [];
  const owners = new Map<string, string>();

  for (const [namespace, slice] of Object.entries(slices)) {
    if (!isNamespace(namespace)) {
      violations.push({ namespace, key: "*", reason: "unknown-namespace" });
      continue;
    }

    for (const key of Object.keys(slice)) {
      const owner = namespaceOf(key);
      if (owner === undefined) {
        violations.push({ namespace, key, reason: "unprefixed" });
      } else if (owner !== namespace) {
        violations.push({ namespace, key, reason: "wrong-namespace" });
      }

      if (owners.has(key)) {
        violations.push({ namespace, key, reason: "duplicate" });
      } else {
        owners.set(key, namespace);
      }
    }
  }

  return violations;
}

/** Throws when any namespace rule is broken. Intended for dev and test builds. */
export function assertNamespaces(
  slices: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): void {
  const violations = findNamespaceViolations(slices);
  if (violations.length > 0) {
    const summary = violations.map((v) => `${v.namespace}.${v.key} (${v.reason})`).join(", ");
    throw new Error(`Namespace violations: ${summary}`);
  }
}

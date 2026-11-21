import { AppError } from "@avs/core";
import { CAPABILITIES } from "./types";
import type { AdapterManifest } from "./types";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** Returns a list of problems. An empty list means the manifest is valid. */
export function validateManifest(manifest: AdapterManifest): string[] {
  const problems: string[] = [];

  if (!ID_PATTERN.test(manifest.id)) {
    problems.push("id must be 2-40 characters: lowercase letters, digits and hyphen");
  }
  if (manifest.displayName.trim().length === 0) {
    problems.push("displayName must not be empty");
  }
  if (manifest.capabilities.length === 0) {
    problems.push("at least one capability is required");
  }

  const known: readonly string[] = CAPABILITIES;
  const declared = new Set<string>();
  for (const capability of manifest.capabilities) {
    if (!known.includes(capability)) {
      problems.push(`unknown capability: ${capability}`);
    }
    if (declared.has(capability)) {
      problems.push(`duplicate capability: ${capability}`);
    }
    declared.add(capability);
  }

  for (const key of Object.keys(manifest.limits)) {
    if (!declared.has(key)) {
      problems.push(`limits declared for unsupported capability: ${key}`);
    }
  }

  for (const [key, cost] of Object.entries(manifest.costs)) {
    if (!declared.has(key)) {
      problems.push(`costs declared for unsupported capability: ${key}`);
    }
    if (cost !== undefined && (!Number.isFinite(cost.priceUsd) || cost.priceUsd < 0)) {
      problems.push(`invalid price for ${key}`);
    }
  }

  return problems;
}

export function assertValidManifest(manifest: AdapterManifest): void {
  const problems = validateManifest(manifest);
  if (problems.length > 0) {
    throw new AppError({
      code: "validation.invalid_manifest",
      category: "validation",
      messageKey: "error.validation.manifest",
      message: `Invalid adapter manifest "${manifest.id}": ${problems.join("; ")}`,
      recoverable: false,
      details: { id: manifest.id, problems },
    });
  }
}

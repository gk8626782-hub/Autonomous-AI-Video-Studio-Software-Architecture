import { AppError } from "@avs/core";
import { assertValidManifest } from "./manifest";
import type { Capability, ProviderAdapter } from "./types";

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    assertValidManifest(adapter.manifest);
    if (this.adapters.has(adapter.manifest.id)) {
      throw new AppError({
        code: "validation.duplicate_adapter",
        category: "validation",
        messageKey: "error.validation.duplicateAdapter",
        message: `Adapter already registered: ${adapter.manifest.id}`,
        recoverable: false,
        details: { id: adapter.manifest.id },
      });
    }
    this.adapters.set(adapter.manifest.id, adapter);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  list(capability?: Capability): ProviderAdapter[] {
    const all = [...this.adapters.values()];
    return capability === undefined
      ? all
      : all.filter((adapter) => adapter.manifest.capabilities.includes(capability));
  }

  /**
   * Builds the fallback chain for a capability in the user's preferred order.
   * Unknown ids and adapters without the capability are skipped.
   */
  chainFor(capability: Capability, preferredIds: readonly string[]): ProviderAdapter[] {
    const chain: ProviderAdapter[] = [];
    for (const id of preferredIds) {
      const adapter = this.adapters.get(id);
      if (
        adapter !== undefined &&
        adapter.manifest.capabilities.includes(capability) &&
        !chain.includes(adapter)
      ) {
        chain.push(adapter);
      }
    }
    return chain;
  }
}

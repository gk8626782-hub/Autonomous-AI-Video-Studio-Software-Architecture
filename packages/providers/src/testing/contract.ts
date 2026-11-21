import { describe, expect, it } from "vitest";
import { validateManifest } from "../manifest";
import { awaitOutput } from "../run";
import type { AdapterContext, Capability, GenerationRequest, ProviderAdapter } from "../types";

export type ContractSamples = Partial<Record<Capability, GenerationRequest>>;

const context: AdapterContext = {
  apiKey: "test-key",
  resolveMedia: async () => new Blob(["reference"]),
};

const instant = async (): Promise<void> => undefined;

/**
 * Reusable test suite. Every adapter (mock or real, with recorded fixtures)
 * must pass it before it is registered in the app.
 */
export function runAdapterContract(
  name: string,
  create: () => ProviderAdapter,
  samples: ContractSamples,
): void {
  describe(`adapter contract: ${name}`, () => {
    it("has a valid manifest", () => {
      expect(validateManifest(create().manifest)).toEqual([]);
    });

    for (const capability of create().manifest.capabilities) {
      describe(capability, () => {
        const sample = samples[capability];

        it("has a sample request", () => {
          expect(sample).toBeDefined();
        });

        it("estimates a non-negative cost", () => {
          const estimate = create().estimateCost(sample as GenerationRequest);
          expect(estimate.usd).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(estimate.usd)).toBe(true);
        });

        it("completes a job through submit and poll", async () => {
          const adapter = create();
          const handle = await adapter.submit(sample as GenerationRequest, context);
          expect(handle.providerId).toBe(adapter.manifest.id);
          expect(handle.capability).toBe(capability);

          const output = await awaitOutput(adapter, handle, context, { sleep: instant });
          expect(output.kind).toBe(capability === "text" ? "text" : "media");
        });

        it("never reports success after a cancel", async () => {
          const adapter = create();
          const handle = await adapter.submit(sample as GenerationRequest, context);
          await adapter.cancel(handle, context);

          const outcome = await adapter.poll(handle, context).then(
            (result) => result.status,
            () => "threw",
          );
          expect(outcome).not.toBe("succeeded");
        });
      });
    }
  });
}

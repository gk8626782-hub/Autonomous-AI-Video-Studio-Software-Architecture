import { awaitOutput, providerError } from "@avs/providers";
import type { AdapterContext, ProviderAdapter, TextRequest } from "@avs/providers";
import type { TextGenerator } from "./types";

export interface AdapterGeneratorOptions {
  readonly intervalMs?: number;
  readonly maxPolls?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Connects the story engine to any text-capable provider adapter. */
export function adapterTextGenerator(
  adapter: ProviderAdapter,
  context: AdapterContext,
  options: AdapterGeneratorOptions = {},
): TextGenerator {
  return async (input) => {
    const request: TextRequest = {
      capability: "text",
      prompt: input.prompt,
      system: input.system,
      maxTokens: input.maxTokens,
      responseFormat: input.json === true ? "json" : "text",
    };

    const handle = await adapter.submit(request, context);
    const output = await awaitOutput(adapter, handle, context, options);
    if (output.kind !== "text") {
      throw providerError("bad_output", {
        providerId: adapter.manifest.id,
        message: "Expected a text result from the provider",
      });
    }
    return { text: output.text, finishReason: output.finishReason ?? "stop" };
  };
}

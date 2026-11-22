import { describe, expect, it } from "vitest";
import { MockAdapter } from "@avs/providers";
import type { AdapterContext } from "@avs/providers";
import { adapterTextGenerator } from "./generator";

const context: AdapterContext = { apiKey: "k", resolveMedia: async () => new Blob() };
const instant = async (): Promise<void> => undefined;

describe("adapterTextGenerator", () => {
  it("sends a text request and returns the text with a stop reason", async () => {
    const adapter = new MockAdapter();
    const generate = adapterTextGenerator(adapter, context, { sleep: instant });

    const output = await generate({ system: "be brief", prompt: "hello", maxTokens: 50 });

    expect(output).toEqual({ text: "mock:hello", finishReason: "stop" });
    expect(adapter.submitted[0]).toMatchObject({
      capability: "text",
      prompt: "hello",
      system: "be brief",
      maxTokens: 50,
      responseFormat: "text",
    });
  });

  it("asks for JSON when requested", async () => {
    const adapter = new MockAdapter();
    const generate = adapterTextGenerator(adapter, context, { sleep: instant });

    await generate({ system: "s", prompt: "p", json: true });
    expect(adapter.submitted[0]).toMatchObject({ responseFormat: "json" });
  });

  it("fails when the provider returns something other than text", async () => {
    const adapter = new MockAdapter();
    const generate = adapterTextGenerator(adapter, context, { sleep: instant });
    const originalPoll = adapter.poll.bind(adapter);
    adapter.poll = async (handle, ctx) => {
      const result = await originalPoll(handle, ctx);
      return result.status === "succeeded"
        ? { status: "succeeded", output: { kind: "media", mime: "image/png", data: new Blob() } }
        : result;
    };

    await expect(generate({ system: "s", prompt: "p" })).rejects.toMatchObject({ code: "provider.bad_output" });
  });
});

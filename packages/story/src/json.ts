import { AppError } from "@avs/core";
import type { z } from "zod";
import { extractJson } from "./text";
import type { TextGenerator } from "./types";

export interface GenerateJsonInput {
  /** Short name used in error messages, for example "outline". */
  readonly label: string;
  readonly system: string;
  readonly prompt: string;
  readonly maxTokens?: number;
  readonly attempts?: number;
}

/**
 * Asks the model for JSON and validates it with a schema. If the reply is
 * invalid, the problem is fed back once and the model tries again.
 * After the last attempt a retryable AppError is thrown.
 */
export async function generateJson<S extends z.ZodTypeAny>(
  generate: TextGenerator,
  schema: S,
  input: GenerateJsonInput,
): Promise<z.output<S>> {
  const attempts = input.attempts ?? 2;
  let feedback = "";
  let lastProblem = "no attempt was made";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const output = await generate({
      system: input.system,
      prompt: feedback === "" ? input.prompt : `${input.prompt}\n\n${feedback}`,
      maxTokens: input.maxTokens,
      json: true,
    });

    try {
      const parsed = schema.safeParse(extractJson(output.text));
      if (parsed.success) {
        return parsed.data;
      }
      lastProblem = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
    } catch (cause) {
      lastProblem = cause instanceof Error ? cause.message : "invalid JSON";
    }

    feedback = `Your previous reply was invalid (${lastProblem}). Reply with ONLY valid JSON that matches the requested format.`;
  }

  throw new AppError({
    code: "story.invalid_model_output",
    category: "media",
    messageKey: "error.story.invalidModelOutput",
    message: `Model did not return valid JSON for ${input.label}: ${lastProblem}`,
    recoverable: true,
    details: { retryable: true, label: input.label },
  });
}

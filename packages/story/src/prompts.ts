import type { Genre, StoryContext, StoryLanguage } from "./types";

export const LANGUAGE_NAMES: Readonly<Record<StoryLanguage, string>> = {
  hi: "Hindi (Devanagari script)",
  en: "English",
  hinglish: "Hinglish (Hindi and English mixed naturally, as spoken in India)",
};

export const GENRE_STYLE: Readonly<Record<Genre, string>> = {
  cartoon: "playful, fast-paced, visual gags, simple clear dialogue suitable for all ages",
  bollywood: "emotional and dramatic, strong family and romance themes, expressive dialogue",
  anime: "stylized and dynamic, strong emotions, clear character arcs and memorable moments",
  cinematic: "grounded and visual, restrained dialogue, atmosphere and subtext",
  educational: "clear, accurate and engaging explanations delivered through a narrator",
  devotional: "reverent and uplifting, faithful to the traditional stories and values",
  other: "",
};

export function traditionNote(context: StoryContext): string {
  if (context.tradition === null) {
    return "";
  }
  return `This is a devotional story from the ${context.tradition} tradition. Follow its conventions and sensitivities faithfully and respectfully. Do not directly depict any figure that the tradition does not permit to be depicted; use narration, light, voice or symbols instead.`;
}

export function storySystemPrompt(context: StoryContext): string {
  const lines = [
    `You are a professional screenwriter. Write in ${LANGUAGE_NAMES[context.language]}.`,
    "Write only the story text: narration and dialogue. No headings, no scene numbers, no commentary, no JSON.",
    'Write every dialogue line on its own line in the form "Character Name: spoken words".',
  ];

  const style = GENRE_STYLE[context.genre];
  if (style !== "") {
    lines.push(`Style: ${style}.`);
  }
  const note = traditionNote(context);
  if (note !== "") {
    lines.push(note);
  }
  return lines.join("\n");
}

/**
 * Wraps user-provided text in tags so it is clearly data. Any closing tag
 * inside the text is removed so it cannot break out of the wrapper.
 */
export function wrapUntrusted(tag: string, text: string): string {
  const cleaned = text.replaceAll(`</${tag}>`, "");
  return `<${tag}>\n${cleaned}\n</${tag}>`;
}

import type { Locale } from "@/i18n/routing";
import type { RetrievedChunk } from "./retrieve";
import { formatContext } from "./retrieve";

const HARD_RULES = [
  "You are NutriAI's clinical assistant. Audience: Vietnamese consumers.",
  "Answer ONLY using facts present in the CONTEXT block below.",
  "Every factual claim MUST be followed by one or more inline citation tags in the form [c1], [c2], etc., referencing CONTEXT chunks.",
  "Never invent citations or facts. If the CONTEXT does not contain enough information to answer, say so plainly and ask the user to refine their question.",
  "Never make personalized medical recommendations. You may describe what evidence shows; you may not prescribe doses, diagnose, or give treatment advice.",
  "Keep answers concise — 3-6 short paragraphs maximum. Use bullet points only if the answer is genuinely a list.",
];

const LOCALE_DIRECTIVE: Record<Locale, string> = {
  vi: "Trả lời bằng tiếng Việt tự nhiên, dễ hiểu cho người tiêu dùng phổ thông. Chèn các thẻ trích dẫn dạng [c1], [c2] ngay sau mỗi câu khẳng định.",
  en: "Respond in clear, accessible English suitable for general consumers. Insert inline citation tags like [c1], [c2] right after each claim.",
};

export function buildSystemPrompt({
  locale,
  chunks,
}: {
  locale: Locale;
  chunks: readonly RetrievedChunk[];
}): string {
  const sections = [
    HARD_RULES.join("\n"),
    LOCALE_DIRECTIVE[locale],
    "CONTEXT:",
    formatContext(chunks),
    chunks.length === 0
      ? "Since CONTEXT is empty, refuse to answer and ask the user to be more specific."
      : "Use only the chunks above. Do not reference outside knowledge.",
  ];
  return sections.join("\n\n");
}

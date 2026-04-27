import "server-only";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag/retrieve";
import { buildSystemPrompt } from "@/lib/rag/system-prompt";
import {
  checkAndRecordChatMessage,
  getUserPlan,
} from "@/lib/rag/rate-limit";
import { routing, type Locale } from "@/i18n/routing";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHAT_MODEL = "openai/gpt-4o-mini";

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(["system", "user", "assistant"]),
        parts: z.array(z.unknown()).optional(),
        content: z.unknown().optional(),
      })
    )
    .min(1),
  locale: z.enum(routing.locales),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Bad request", { status: 400 });
  }

  const messages = parsed.data.messages as UIMessage[];
  const locale = parsed.data.locale as Locale;

  // Free-tier rate limit. Pro users skip; free users get 10/day.
  const plan = await getUserPlan(user.id);
  const gate = await checkAndRecordChatMessage({ userId: user.id, plan });
  if (!gate.ok) {
    return Response.json(
      {
        error: "rate_limit",
        message:
          locale === "vi"
            ? "Bạn đã hết lượt hỏi miễn phí cho hôm nay. Hãy nâng cấp NutriAI Pro để hỏi không giới hạn."
            : "You've used your free daily message quota. Upgrade to NutriAI Pro for unlimited messages.",
      },
      { status: 429 }
    );
  }

  // Retrieval based on the latest user turn.
  const lastUser = [...messages]
    .reverse()
    .find((m) => m.role === "user") as UIMessage | undefined;
  const lastUserText = extractText(lastUser);
  const chunks = await retrieveChunks(lastUserText);

  const result = streamText({
    model: CHAT_MODEL,
    system: buildSystemPrompt({ locale, chunks }),
    messages: await convertToModelMessages(messages),
    temperature: 0.2,
    maxOutputTokens: 800,
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: () => buildCitationMetadata(chunks),
  });
}

type CitationMetadata = {
  citations: Array<{
    key: string;
    source: RetrievedChunk["source"];
    title: string;
    href: string;
  }>;
};

function buildCitationMetadata(
  chunks: readonly RetrievedChunk[]
): CitationMetadata {
  return {
    citations: chunks.map((c) => ({
      key: c.citationKey,
      source: c.source,
      title: c.title,
      href: c.href,
    })),
  };
}

function extractText(message: UIMessage | undefined): string {
  if (!message) return "";
  // UIMessage may have either `parts` (v6) or legacy `content` (string).
  if (Array.isArray(message.parts)) {
    return message.parts
      .map((p): string => {
        if (
          typeof p === "object" &&
          p !== null &&
          "type" in p &&
          (p as { type: unknown }).type === "text" &&
          "text" in p
        ) {
          return String((p as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

"use client";

import { useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { useTranslations } from "next-intl";
import { Send, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { Locale } from "@/i18n/routing";

type Citation = {
  key: string;
  source: "evidence" | "article" | "ingredient" | "supplement";
  title: string;
  href: string;
};

type CitationMessage = { metadata?: { citations?: Citation[] } };

const CITATION_RE = /\[(c\d+)\]/g;

export function ChatConversation({
  locale,
  placeholder,
  startSuggestions,
}: Readonly<{
  locale: Locale;
  placeholder: string;
  startSuggestions: readonly string[];
}>) {
  const t = useTranslations("Chat");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { messages, sendMessage, status } = useChat<CitationMessage & { id: string; role: "user" | "assistant"; parts: Array<{ type: "text"; text: string }> }>({
    onError: (err) => {
      // Surface rate-limit responses as a friendly notice instead of a
      // raw error toast.
      try {
        const body = JSON.parse(err.message);
        if (body.error === "rate_limit") {
          setError(body.message ?? t("rateLimit"));
          return;
        }
      } catch {
        /* not JSON */
      }
      setError(t("genericError"));
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setError(null);
    setInput("");
    sendMessage(
      { text },
      { body: { locale } }
    );
  }

  function send(text: string) {
    if (isStreaming) return;
    setError(null);
    sendMessage({ text }, { body: { locale } });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <Empty
              suggestions={startSuggestions}
              onPick={send}
              title={t("emptyTitle")}
              body={t("emptyBody")}
            />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {error && (
            <Alert variant="default" className="border-destructive/50">
              <AlertTitle>{t("alertTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 border-t backdrop-blur">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={isStreaming}
            className="h-11"
            aria-label={t("composerLabel")}
          />
          <Button
            type="submit"
            size="lg"
            disabled={isStreaming || input.trim().length === 0}
          >
            <Send className="size-4" aria-hidden />
            <span className="sr-only">{t("send")}</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

function Empty({
  suggestions,
  onPick,
  title,
  body,
}: Readonly<{
  suggestions: readonly string[];
  onPick: (text: string) => void;
  title: string;
  body: string;
}>) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" aria-hidden />
          <h2 className="text-foreground text-base font-semibold">{title}</h2>
        </div>
        <p className="text-muted-foreground text-sm">{body}</p>
        <div className="flex flex-col gap-1.5 pt-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="bg-accent/40 hover:bg-accent text-foreground rounded-md px-3 py-2 text-left text-sm transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type DisplayMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<{ type: string; text?: string }>;
  metadata?: { citations?: Citation[] };
};

function MessageBubble({ message }: Readonly<{ message: DisplayMessage }>) {
  if (message.role === "system") return null;

  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n");

  const isUser = message.role === "user";
  const citations = message.metadata?.citations ?? [];

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5"
            : "bg-card border-border max-w-[90%] rounded-2xl rounded-bl-md border px-4 py-3"
        }
      >
        <div className="text-sm leading-relaxed">
          {isUser ? (
            text
          ) : (
            <RichText text={text} citations={citations} />
          )}
        </div>
        {!isUser && citations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {citations
              .filter((c) => text.includes(`[${c.key}]`))
              .map((c) => (
                <a
                  key={c.key}
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel={
                    c.href.startsWith("http") ? "noopener noreferrer" : undefined
                  }
                  className="bg-accent hover:bg-primary/15 inline-flex max-w-[260px] items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
                >
                  <Badge variant="outline" className="-ml-1.5">
                    {c.key}
                  </Badge>
                  <span className="text-muted-foreground truncate">
                    {c.title}
                  </span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render assistant text with `[cN]` citation tokens replaced by clickable
 * superscript chips. The full citations list lives in metadata; here we
 * just turn the inline tag into a small visual marker.
 */
function RichText({
  text,
  citations,
}: Readonly<{ text: string; citations: readonly Citation[] }>) {
  const byKey = new Map(citations.map((c) => [c.key, c]));
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const matches = [...text.matchAll(CITATION_RE)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const idx = match.index ?? 0;
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    const cite = byKey.get(match[1]);
    parts.push(
      <CiteChip key={`${idx}-${match[1]}`} citation={cite ?? null} fallback={match[0]} />
    );
    cursor = idx + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function CiteChip({
  citation,
  fallback,
}: Readonly<{ citation: Citation | null; fallback: string }>) {
  if (!citation) {
    return <sup className="text-muted-foreground"> {fallback}</sup>;
  }
  return (
    <a
      href={citation.href}
      target={citation.href.startsWith("http") ? "_blank" : undefined}
      rel={
        citation.href.startsWith("http") ? "noopener noreferrer" : undefined
      }
      className="text-primary hover:underline align-super text-[10px] font-medium"
    >
      [{citation.key}]
    </a>
  );
}

# 08 — RAG (BR4)

## Pipeline

```
user turn
   │
   ▼
embed(query)  ← lib/knowledge/embed.ts (text-embedding-3-small, 1536d)
   │
   ▼
search_knowledge_hybrid(query, embedding, 16)
   │  union-all per source: FTS + vector top-K
   │  evidence, articles, ingredients, supplements
   ▼
RetrievedChunk[] with citationKey c1..cN
   │
   ▼
buildSystemPrompt({ locale, chunks })
   │
   ▼
streamText({ model: "openai/gpt-4o-mini", system, messages })
   │
   ▼
toUIMessageStreamResponse({ messageMetadata: { citations } })
```

## Source code map

- [`supabase/migrations/0005_rag.sql`](../../supabase/migrations/0005_rag.sql) —
  the hybrid SQL function and rate-limit table.
- [`lib/rag/retrieve.ts`](../../lib/rag/retrieve.ts) — embed + RPC
  call + chunk normalization.
- [`lib/rag/system-prompt.ts`](../../lib/rag/system-prompt.ts) — hard
  rules + locale directive + context block.
- [`lib/rag/rate-limit.ts`](../../lib/rag/rate-limit.ts) —
  `checkAndRecordChatMessage`, `getUserPlan`, `CHAT_FREE_DAILY_LIMIT`.
- [`app/api/chat/route.ts`](../../app/api/chat/route.ts) — Vercel AI
  SDK `streamText` with the RAG context, returning a UI Message
  Stream Response with citation metadata.
- [`components/chat-conversation.tsx`](../../components/chat-conversation.tsx) —
  client UI using `@ai-sdk/react`'s `useChat`. Renders citation chips
  by parsing `[cN]` tags inline and matching against the metadata
  list returned with each assistant message.
- [`app/[locale]/chat/page.tsx`](../../app/[locale]/chat/page.tsx) —
  server-rendered shell with locale-aware suggested prompts.

## Citation contract

- The model is required to emit `[cN]` immediately after each claim.
- The server attaches `messageMetadata.citations` as
  `Array<{ key: "c1", source, title, href }>` on the assistant
  message.
- The client renders inline `[cN]` as small superscript chips and
  shows the full chip strip below the bubble. Chips link to
  `/supplements/[slug]`, the original PubMed/ODS URL, or the feed.

## Rate limiting

- Free tier: 10 messages / day per user. Insert into
  `public.chat_message_log` happens at the **start** of the request,
  *before* the model call, so a streaming failure still counts. The
  alternative — record after success — opens a free-quota infinite
  loop on transient errors.
- Pro tier (per `profiles.plan = 'pro'` and unexpired `pro_until`)
  skips the gate.
- 429 responses surface as a friendly bilingual notice in the chat UI.

## Failure modes

- **AI Gateway unconfigured**: `embedText` throws "missing env var",
  `retrieveChunks` returns FTS-only results. The chat still answers
  if there's any FTS hit.
- **Empty retrieval**: prompt instructs model to refuse and ask for a
  more specific question.
- **Stale subscription / model error**: client shows a generic alert;
  no auto-retry.

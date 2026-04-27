# 00 — Overview

NutriAI is an evidence-based nutritional intelligence platform for general
consumers in Vietnam (with English support). The product question we are
trying to answer is: _"can I take this supplement, and is it good?"_ — with
sources, every time.

## Phase 1 in scope

- **BR1 — Knowledge Hub**: search, supplement detail, Quality Index, content feed.
- **BR2 — Adherence Tracking**: regimens, daily log, reminders, analytics.
- **BR4 — Grounded RAG Assistant**: chat over our cited corpus.

## Phase 1 explicitly out of scope

- BR3 NutriScan (camera + OCR) — phase 2.
- B2B Enterprise API — phase 2+.
- Native mobile wrappers.

## Audience

General consumers, mobile-first. Default locale is Vietnamese; English is
available via locale switcher. The product should feel clinical-but-friendly
and never lifestyle-influencer.

## Success signals (informal)

- A user can find a supplement they own and read its evidence in < 60s.
- A user with a regimen logs intake daily without friction.
- The chat never makes a claim without a citation.
- Premium upgrade via SePay completes in one bank-transfer roundtrip.

## Anti-goals

- We do not make health claims of our own. We surface peer-reviewed
  evidence and label its strength.
- We do not store payment card data. SePay reconciles bank transfers.
- We do not generate "wellness advice" without retrieval grounding.

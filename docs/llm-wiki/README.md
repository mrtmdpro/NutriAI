# NutriAI codebase wiki

A Karpathy-style "build it from first principles" wiki of NutriAI for future
agents (and humans). Each chapter is short, sequential, and dense with
links into the actual source. Keep it accurate; update it when invariants
change.

The chapters are deliberately ordered so a fresh reader can absorb the
project front to back in under 30 minutes.

| #   | File                                         | Purpose                                                        |
| --- | -------------------------------------------- | -------------------------------------------------------------- |
| 00  | [overview.md](./00-overview.md)              | What NutriAI is, why it exists, scope of phase 1               |
| 01  | [architecture.md](./01-architecture.md)      | Stack, runtime model, data flow                                |
| 02  | [data-model.md](./02-data-model.md)          | Postgres schema, RLS, indexes                                  |
| 03  | [routes.md](./03-routes.md)                  | URL map, locale prefixing, gated paths                         |
| 04  | [conventions.md](./04-conventions.md)        | Code conventions, file layout, common patterns                 |
| 05  | [decisions.md](./05-decisions.md)            | Architecture decision log (chronological)                      |
| 06  | [external-apis.md](./06-external-apis.md)    | NIH ODS, PubMed, OpenFDA, SePay, Stitch                        |
| 07  | [bilingual.md](./07-bilingual.md)            | i18n, message JSON layout, runtime translation pipeline        |
| 08  | [rag.md](./08-rag.md)                        | RAG retrieval shape, prompt rules, citation contract           |
| 09  | [adherence.md](./09-adherence.md)            | Regimen model, reminder loop, push + email transports          |
| 10  | [payments.md](./10-payments.md)              | SePay reconciliation: payment codes, webhook idempotency       |
| 11  | [auth.md](./11-auth.md)                      | Sign-in / sign-up flows, callbacks, profile provisioning       |

## How to maintain

- After each sprint, append/update the affected chapter rather than
  letting the wiki rot.
- Prefer linking to source files like `[proxy.ts](../../proxy.ts)`
  over duplicating code blocks.
- When a fact changes (a column, a route, a contract), update the wiki in
  the same change that updates the code.

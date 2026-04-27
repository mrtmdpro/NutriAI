import "server-only";
import { z } from "zod";

// Module-load validation is loose so `next build` succeeds before
// secrets are provisioned (Sprint 0 / first deploy). Runtime strictness
// lives in requireServerEnv() and fires when the consuming feature
// (cron, webhook, RAG, etc.) runs without its key.
const optionalString = z.string().min(1).optional();
const optionalEmail = z.string().email().optional();

const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  // Either AI_GATEWAY_API_KEY (Vercel Gateway) or OPENAI_API_KEY
  // (direct OpenAI) unlocks embeddings + chat. lib/ai/models.ts
  // prefers the gateway when both are set.
  AI_GATEWAY_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  CRON_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  STITCH_API_KEY: optionalString,
  SEPAY_API_KEY: optionalString,
  SEPAY_BANK_ACCOUNT: optionalString,
  SEPAY_BANK_NAME: optionalString,
  SEPAY_ACCOUNT_HOLDER: optionalString,
  WEB_PUSH_PUBLIC_KEY: optionalString,
  WEB_PUSH_PRIVATE_KEY: optionalString,
  WEB_PUSH_CONTACT_EMAIL: optionalEmail,
});

export const serverEnv = schema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  STITCH_API_KEY: process.env.STITCH_API_KEY,
  SEPAY_API_KEY: process.env.SEPAY_API_KEY,
  SEPAY_BANK_ACCOUNT: process.env.SEPAY_BANK_ACCOUNT,
  SEPAY_BANK_NAME: process.env.SEPAY_BANK_NAME,
  SEPAY_ACCOUNT_HOLDER: process.env.SEPAY_ACCOUNT_HOLDER,
  WEB_PUSH_PUBLIC_KEY: process.env.WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY: process.env.WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_CONTACT_EMAIL: process.env.WEB_PUSH_CONTACT_EMAIL,
});

export function requireServerEnv<K extends keyof typeof serverEnv>(
  key: K
): NonNullable<(typeof serverEnv)[K]> {
  const value = serverEnv[key];
  if (!value) {
    throw new Error(
      `Missing required env var: ${key}. Set it in .env.local or via 'vercel env pull'.`
    );
  }
  return value as NonNullable<(typeof serverEnv)[K]>;
}

export function isMissingEnvError(err: unknown): boolean {
  return (
    err instanceof Error && err.message.startsWith("Missing required env var:")
  );
}
